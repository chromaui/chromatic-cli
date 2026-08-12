import { readJson } from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';

import { MainConfigReader, readMainConfig } from '../getStorybookMetadata';
import TestLogger from '../testLogger';
import { readStorybookDirectories } from './storybookDirectories';

vi.mock('fs-extra', () => ({
  readJson: vi.fn(),
}));

vi.mock('../getStorybookMetadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../getStorybookMetadata')>()),
  readMainConfig: vi.fn(),
}));

const log = new TestLogger();

const readJsonMock = vi.mocked<(file: string) => Promise<unknown>>(readJson);

function mockMainConfig(staticDirectories?: unknown) {
  vi.mocked(readMainConfig).mockResolvedValue(
    staticDirectories === undefined
      ? undefined
      : ({ readField: () => staticDirectories } satisfies MainConfigReader)
  );
}

describe('readStorybookDirectories', () => {
  it('reads the -c and -s flags out of the default build script', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -c .storybook-prod -s public,assets' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook-prod',
      staticDirs: ['public', 'assets'],
    });
  });

  it('reads the flags out of a script matching the build-storybook heuristic', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { storybook: 'build-storybook -c .storybook-ci' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook-ci',
      staticDirs: [],
    });
  });

  it('reads the flags out of the requested build script, which the heuristic would miss', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'storybook:ci': 'storybook build -c .storybook-ci -s assets' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({
      projectRoot: '/project',
      log,
      buildScriptName: 'storybook:ci',
    });

    expect(directories).toEqual({ configDir: '.storybook-ci', staticDirs: ['assets'] });
  });

  it('falls back to .storybook when no script matches the build-storybook heuristic', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'storybook:ci': 'storybook build -c .storybook-ci -s assets' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook',
      staticDirs: [],
    });
  });

  it('falls back to .storybook when the requested build script is not in package.json', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -c .storybook-prod -s public' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({
      projectRoot: '/project',
      log,
      buildScriptName: 'storybook:ci',
    });

    expect(directories).toEqual({
      configDir: '.storybook',
      staticDirs: [],
    });
  });

  it('lets an explicit config directory win over the build script', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -c .storybook-prod' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({
      projectRoot: '/project',
      log,
      configDir: '.storybook-explicit',
    });

    expect(directories).toEqual({ configDir: '.storybook-explicit', staticDirs: [] });
    expect(readMainConfig).toHaveBeenCalledWith('/project/.storybook-explicit', log);
  });

  it('lets explicit static directories replace the derived ones without reading the config', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -s public' },
    });
    mockMainConfig(['./from-main']);

    const directories = await readStorybookDirectories({
      projectRoot: '/project',
      log,
      staticDirs: ['explicit'],
    });

    expect(directories).toEqual({ configDir: '.storybook', staticDirs: ['explicit'] });
    expect(readMainConfig).not.toHaveBeenCalled();
  });

  it('treats an explicit empty list of static directories as a configured value', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -s public' },
    });
    mockMainConfig(['./from-main']);

    const directories = await readStorybookDirectories({
      projectRoot: '/project',
      log,
      staticDirs: [],
    });

    expect(directories).toEqual({ configDir: '.storybook', staticDirs: [] });
    expect(readMainConfig).not.toHaveBeenCalled();
  });

  it("merges the build script's -s with main.*'s staticDirs, resolved against the config dir", async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -s public' },
    });
    mockMainConfig(['./assets', { from: '../shared', to: '/shared' }]);

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook',
      staticDirs: ['public', '.storybook/assets', 'shared'],
    });
  });

  it("merges the build script's -s with main.*'s staticDirs, resolved against the config dir even if it's outside the project directory", async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -s public' },
    });
    mockMainConfig(['./assets', { from: '../../../shared', to: '/shared' }]);

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook',
      staticDirs: ['public', '.storybook/assets', '../shared'],
    });
  });

  it('rewrites absolute directories as project-relative ones', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -c /project/config/storybook' },
    });
    mockMainConfig(['/project/public']);

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: 'config/storybook',
      staticDirs: ['public'],
    });
  });

  it('dedupes static directories that differ only in how they are written', async () => {
    readJsonMock.mockResolvedValue({
      scripts: { 'build-storybook': 'storybook build -s ./public,public' },
    });
    mockMainConfig();

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({ configDir: '.storybook', staticDirs: ['public'] });
  });

  it('defaults to .storybook when package.json cannot be read', async () => {
    readJsonMock.mockRejectedValue(new Error('ENOENT'));
    mockMainConfig();

    const directories = await readStorybookDirectories({ projectRoot: '/project', log });

    expect(directories).toEqual({
      configDir: '.storybook',
      staticDirs: [],
    });
    expect(log.entries).toContainEqual('Failed to read config flags from package.json');
  });
});
