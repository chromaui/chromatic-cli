import { readJson } from 'fs-extra';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { MainConfigReader, readMainConfig } from '../getStorybookMetadata';
import { readStorybookDirectories } from './storybookDirectories';

const { readMainConfig: readMainConfigActual } =
  await vi.importActual<typeof import('../getStorybookMetadata')>('../getStorybookMetadata');

vi.mock('fs-extra', () => ({
  readJson: vi.fn(),
}));

// Only the config read is faked: the flag parsing, the staticDirs resolution and their merge are
// the behaviour under test, so they run for real.
vi.mock('../getStorybookMetadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../getStorybookMetadata')>()),
  readMainConfig: vi.fn(),
}));

const log = { debug: vi.fn() } as any;

// `readJson` is overloaded, so name the promise-returning overload the mock stands in for.
const readJsonMock = vi.mocked<(file: string) => Promise<unknown>>(readJson);

function mockPackageJson(scripts: Record<string, string>) {
  readJsonMock.mockResolvedValue({ scripts });
}

function mockMainConfig(staticDirectories?: unknown) {
  vi.mocked(readMainConfig).mockResolvedValue(
    staticDirectories === undefined
      ? undefined
      : ({ readField: () => staticDirectories, isAstConfig: true } satisfies MainConfigReader)
  );
}

describe('readStorybookDirectories', () => {
  it('reads the -c and -s flags out of the default build script', async () => {
    mockPackageJson({ 'build-storybook': 'storybook build -c .storybook-prod -s public,assets' });
    mockMainConfig();

    await expect(readStorybookDirectories({ projectRoot: '/project', log })).resolves.toEqual({
      configDir: '.storybook-prod',
      staticDirs: ['public', 'assets'],
    });
  });

  it('reads the flags out of a script matching the build-storybook heuristic', async () => {
    mockPackageJson({ storybook: 'build-storybook -c .storybook-ci' });
    mockMainConfig();

    await expect(readStorybookDirectories({ projectRoot: '/project', log })).resolves.toEqual({
      configDir: '.storybook-ci',
      staticDirs: [],
    });
  });

  it('reads the flags out of the requested build script, which the heuristic would miss', async () => {
    mockPackageJson({ 'storybook:ci': 'storybook build -c .storybook-ci -s assets' });
    mockMainConfig();

    await expect(
      readStorybookDirectories({ projectRoot: '/project', log, buildScriptName: 'storybook:ci' })
    ).resolves.toEqual({ configDir: '.storybook-ci', staticDirs: ['assets'] });
  });

  it('falls back to .storybook when the requested build script is not in package.json', async () => {
    mockPackageJson({ 'storybook:ci': 'storybook build -c .storybook-ci -s assets' });
    mockMainConfig();

    await expect(readStorybookDirectories({ projectRoot: '/project', log })).resolves.toEqual({
      configDir: '.storybook',
      staticDirs: [],
    });
  });

  it('lets an explicit config directory win over the build script', async () => {
    mockPackageJson({ 'build-storybook': 'storybook build -c .storybook-prod' });
    mockMainConfig();

    await expect(
      readStorybookDirectories({ projectRoot: '/project', log, configDir: '.storybook-explicit' })
    ).resolves.toEqual({ configDir: '.storybook-explicit', staticDirs: [] });
    expect(readMainConfig).toHaveBeenCalledWith(
      '/project/.storybook-explicit',
      log,
      expect.any(RegExp)
    );
  });

  it('lets explicit static directories replace the derived ones without reading the config', async () => {
    mockPackageJson({ 'build-storybook': 'storybook build -s public' });
    mockMainConfig(['./from-main']);

    await expect(
      readStorybookDirectories({ projectRoot: '/project', log, staticDirs: ['explicit'] })
    ).resolves.toEqual({ configDir: '.storybook', staticDirs: ['explicit'] });
    expect(readMainConfig).not.toHaveBeenCalled();
  });

  it("merges the build script's -s with main.*'s staticDirs, resolved against the config dir", async () => {
    mockPackageJson({ 'build-storybook': 'storybook build -s public' });
    mockMainConfig(['./assets', { from: '../shared', to: '/shared' }]);

    await expect(readStorybookDirectories({ projectRoot: '/project', log })).resolves.toEqual({
      configDir: '.storybook',
      staticDirs: ['public', '.storybook/assets', 'shared'],
    });
  });

  it('degrades to .storybook when package.json cannot be read', async () => {
    readJsonMock.mockRejectedValue(new Error('ENOENT'));
    mockMainConfig();

    await expect(readStorybookDirectories({ projectRoot: '/project', log })).resolves.toEqual({
      configDir: '.storybook',
      staticDirs: [],
    });
  });
});

// Real fixture projects, because which extensions reach the AST parser depends on whether
// `require()` of the config succeeds. Every shape resolves here, evaluated or parsed; the ones
// `getStorybookMetadata` deliberately leaves unset stay out of what TurboSnap v1 reads.
describe('readStorybookDirectories main config extensions', () => {
  it.each([
    { project: 'ts-esm', file: 'main.ts' },
    { project: 'mjs-esm', file: 'main.mjs' },
    { project: 'cjs', file: 'main.cjs' },
    { project: 'js-esm', file: 'main.js in an esm package' },
    { project: 'js-cjs', file: 'main.js in a cjs package' },
  ])('resolves staticDirs from $file', async ({ project }) => {
    vi.mocked(readMainConfig).mockImplementation(readMainConfigActual);
    readJsonMock.mockResolvedValue({});

    await expect(
      readStorybookDirectories({
        projectRoot: path.resolve('node-src/__mocks__/storybookMainConfig', project),
        log,
      })
    ).resolves.toEqual({
      configDir: '.storybook',
      staticDirs: ['.storybook/static', 'public'],
    });
  });
});
