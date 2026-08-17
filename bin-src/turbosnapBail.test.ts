import { traceChangedFiles } from '@cli/turbosnap/v2';
import { readJson } from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../node-src/types';
import { main } from './turbosnapBail';

// This fake project root is entirely off disk, so every path it names reads as present, and as
// whichever of a file or a directory the asking guard is looking for.
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: () => true,
  statSync: () => ({ isFile: () => true, isDirectory: () => true }),
}));

const { statsRef } = vi.hoisted(() => ({ statsRef: { current: {} as Stats } }));

vi.mock('../node-src/tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(() => Promise.resolve(statsRef.current)),
}));

vi.mock('../node-src/git/git', () => ({
  getRepositoryRoot: vi.fn(() => Promise.resolve('/repo')),
}));

vi.mock('../node-src/lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'x']))),
}));

// The manifest reads the installed Storybook version off disk, which this fake project root has no
// node_modules for. See node-src/lib/turbosnap/v2/storybookVersion.test.ts for the probe itself.
vi.mock('../node-src/lib/turbosnap/v2/storybookVersion', () => ({
  resolveStorybookVersion: () => '9.1.20',
}));

vi.mock('fs-extra', () => ({
  readJson: vi.fn((_filePath: string): Promise<Record<string, any>> => Promise.resolve({})),
}));

// Only asserted against where the command's own logic is under test; the bail tests run the real
// guards so the wiring itself is covered.
vi.mock('@cli/turbosnap/v2', () => ({ traceChangedFiles: vi.fn() }));

const projectJson = {
  builder: 'storybook-builder-rsbuild',
  framework: { name: 'storybook-react-rsbuild' },
  hasStaticDirs: true,
  storybookVersion: '10.6.0-alpha.3',
  storybookPackages: { 'storybook-builder-rsbuild': { version: '3.3.4' } },
};

// Through mockImplementation rather than mockResolvedValue, because fs-extra's callback overload is
// the one vi.mocked resolves to and it declares no return value.
function readProjectJsonAs(contents: Record<string, any>) {
  vi.mocked(readJson).mockImplementation(() => Promise.resolve(contents));
}

describe('turbosnap-bail command', () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
    statsRef.current = {
      modules: [
        {
          id: 1,
          name: '/repo/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
      ],
    };
    // The project root has no package.json in these tests, and project.json is the only file the
    // command reads through fs-extra.
    vi.mocked(readJson).mockImplementation((filePath: any) =>
      String(filePath).endsWith('project.json')
        ? Promise.resolve(projectJson)
        : Promise.reject(new Error('ENOENT'))
    );
    vi.mocked(traceChangedFiles).mockResolvedValue({ status: 'fallback' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function writtenVerdict() {
    return JSON.parse(stdout.mock.calls[0][0] as string);
  }

  it('runs the production guards against the derived input', async () => {
    await main(['-s', 'storybook-static/preview-stats.json', '-b', 'packages/ui']);

    expect(traceChangedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        stats: statsRef.current,
        statsPath: '/repo/packages/ui/storybook-static/preview-stats.json',
        projectRoot: '/repo/packages/ui',
        configDir: '.storybook',
        // Production writes its diagnostic manifest under the prebuilt Storybook it traces.
        manifestOutputDirectory: '/repo/packages/ui/storybook-static/.chromatic',
      })
    );
  });

  it('takes the declared builder and static directories from the prebuilt project.json', async () => {
    await main(['-b', 'packages/ui']);

    expect(readJson).toHaveBeenCalledWith('/repo/packages/ui/storybook-static/project.json');
    expect(traceChangedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        builderName: 'storybook-builder-rsbuild',
        staticDirsDeclared: true,
      })
    );
  });

  it('looks for project.json where --project-json says, so synthetic stats keep their metadata', async () => {
    await main(['-s', '/tmp/synthetic-stats.json', '--project-json', '/repo/real/project.json']);

    expect(readJson).toHaveBeenCalledWith('/repo/real/project.json');
  });

  it('reports the builder generation the stats came from', async () => {
    await main(['-b', 'packages/ui']);

    expect(writtenVerdict().storybook).toMatchObject({
      projectJsonFound: true,
      builderSource: 'project.json',
      version: '10.6.0-alpha.3',
      builder: { name: 'storybook-builder-rsbuild', version: '3.3.4' },
    });
  });

  it('names no builder when project.json declares none, rather than defaulting to one', async () => {
    readProjectJsonAs({
      framework: { name: 'storybook-react-rsbuild' },
      hasStaticDirs: false,
      storybookVersion: '9.1.20',
      storybookPackages: { 'storybook-react-rsbuild': { version: '2.1.6' } },
    });

    await main(['-b', 'packages/ui']);

    const { storybook } = writtenVerdict();
    expect(storybook.builderSource).toBe('unrecorded');
    expect(storybook.builder).toEqual({});
    // The framework package version is the only record of the generation for these builds.
    expect(storybook.framework).toEqual({ name: 'storybook-react-rsbuild', version: '2.1.6' });
    expect(traceChangedFiles).toHaveBeenCalledWith(
      expect.not.objectContaining({ builderName: expect.anything() })
    );
  });

  it('prefers the builder --builder-name names, and says the flag named it', async () => {
    await main(['-b', 'packages/ui', '--builder-name', '@storybook/builder-vite']);

    expect(traceChangedFiles).toHaveBeenCalledWith(
      expect.objectContaining({ builderName: '@storybook/builder-vite' })
    );
    expect(writtenVerdict().storybook.builderSource).toBe('flag');
  });

  it('reports a clean run as reaching the Index upload', async () => {
    await main(['-b', 'packages/ui']);

    const verdict = writtenVerdict();
    expect(verdict.status).toBe('fallback');
    expect(verdict.bailReason).toBeUndefined();
    expect(process.exitCode).toBeUndefined();
  });

  it('reports the bail reason and exits non-zero when a guard fires', async () => {
    vi.mocked(traceChangedFiles).mockResolvedValue({
      status: 'bailed',
      turboSnap: { bailReason: { noStoryFiles: true } },
    });

    await main(['-b', 'packages/ui']);

    const verdict = writtenVerdict();
    expect(verdict.status).toBe('bailed');
    expect(verdict.bailReason).toEqual({ noStoryFiles: true });
    expect(verdict.reachedIndexUpload).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});

describe('turbosnap-bail command, against the real guards', () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The suite above stubs the module under integration; these tests want the real thing.
    vi.doUnmock('@cli/turbosnap/v2');
    vi.resetModules();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
    readProjectJsonAs(projectJson);
    statsRef.current = {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
      ],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  async function runRealGuards() {
    const { main: realMain } = await import('./turbosnapBail');
    await realMain(['-b', 'packages/ui']);
    return JSON.parse(stdout.mock.calls[0][0] as string);
  }

  it('reports a bail from the guards that run before a manifest exists', async () => {
    // project.json declares static directories and this fake project resolves none, which is the
    // pre-manifest guard reading the metadata only this command supplies.
    const verdict = await runRealGuards();

    expect(verdict.status).toBe('bailed');
    expect(verdict.bailReason).toEqual({ unresolvedStaticDirectories: true });
    expect(verdict.reachedIndexUpload).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('reports a bail from the guards that run against the built manifest', async () => {
    readProjectJsonAs({ ...projectJson, hasStaticDirs: false });

    const verdict = await runRealGuards();

    // This fake project root has no readable config directory. Which reason wins is the guards'
    // business; that a reason arrives at all is this command's.
    expect(verdict.status).toBe('bailed');
    expect(verdict.bailReason).toEqual({ noStorybookConfigFiles: true });
    expect(verdict.manifestFile).toBe(
      '/repo/packages/ui/storybook-static/.chromatic/turbosnap-manifest.json'
    );
  });
});
