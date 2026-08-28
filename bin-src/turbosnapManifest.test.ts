import { buildManifest, serializeManifest } from '@cli/turbosnap/v2/manifest';
import { realProjectFiles } from '@cli/turbosnap/v2/projectFiles';
import { existsSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRepositoryRoot } from '../node-src/git/git';
import TestLogger from '../node-src/lib/testLogger';
import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { main } from './turbosnapManifest';

const testLogger = new TestLogger();
const manifest = { storybookHash: 'abc' };
const serialized = { storybookHash: 'abc', storyFiles: {} };
const projectFiles = { readFile: vi.fn() };

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: vi.fn(() => true),
}));

vi.mock('@cli/turbosnap/v2/manifest', () => ({
  buildManifest: vi.fn(() => manifest),
  serializeManifest: vi.fn(() => serialized),
}));

vi.mock('@cli/turbosnap/v2/projectFiles', () => ({
  realProjectFiles: vi.fn(() => projectFiles),
}));

vi.mock('../node-src/git/git', () => ({
  getRepositoryRoot: vi.fn(() => '/repo'),
}));

vi.mock('../node-src/tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(() => ({ modules: [] })),
}));

vi.mock('../node-src/lib/log', () => ({
  createLogger: vi.fn(() => testLogger),
}));

beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue('/repo');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('turbosnap-manifest', () => {
  it('builds the manifest from the default stats file in the current directory', async () => {
    await main([]);

    expect(readStatsFile).toHaveBeenCalledWith('/repo/storybook-static/preview-stats.json');
    expect(buildManifest).toHaveBeenCalledWith(
      { modules: [] },
      {
        log: testLogger,
        projectRoot: '/repo',
        configDir: '/repo/.storybook',
        staticDirs: [],
        projectFiles,
      }
    );
    expect(realProjectFiles).toHaveBeenCalled();
  });

  it('resolves the project root from --storybook-base-dir, relative to the repository root', async () => {
    await main(['-b', 'packages/ui']);

    expect(getRepositoryRoot).toHaveBeenCalled();
    expect(readStatsFile).toHaveBeenCalledWith(
      '/repo/packages/ui/storybook-static/preview-stats.json'
    );
    expect(buildManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectRoot: '/repo/packages/ui',
        configDir: '/repo/packages/ui/.storybook',
      })
    );
  });

  it('resolves the project root from STORYBOOK_BASE_DIR when no flag is passed', async () => {
    vi.stubEnv('STORYBOOK_BASE_DIR', 'packages/ui');
    vi.resetModules();

    // The env var is read when the module loads, so this command needs its own import.
    const { main: mainWithEnvironment } = await import('./turbosnapManifest');
    await mainWithEnvironment([]);

    expect(buildManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectRoot: '/repo/packages/ui' })
    );

    vi.unstubAllEnvs();
  });

  it('resolves each --static-dir against the project root', async () => {
    await main(['-b', 'packages/ui', '--static-dir', 'public,assets/images']);

    expect(buildManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        staticDirs: ['/repo/packages/ui/public', '/repo/packages/ui/assets/images'],
      })
    );
  });

  it('resolves --config-dir and --stats-file against the project root', async () => {
    await main(['-c', 'config/storybook', '-s', 'dist/stats.json']);

    expect(readStatsFile).toHaveBeenCalledWith('/repo/dist/stats.json');
    expect(buildManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ configDir: '/repo/config/storybook' })
    );
  });

  it('writes the serialized manifest to stdout', async () => {
    await main([]);

    expect(serializeManifest).toHaveBeenCalledWith(manifest);
    expect(process.stdout.write).toHaveBeenCalledWith(JSON.stringify(serialized, undefined, 2));
  });

  it('names the missing stats file and prints the help, without building anything', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);

    await main(['-s', 'dist/stats.json']);

    expect(testLogger.errors[0]).toContain('No stats file at /repo/dist/stats.json');
    expect(testLogger.errors[1]).toContain('--stats-file');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(buildManifest).not.toHaveBeenCalled();
  });

  it('logs the message and exits when building the manifest fails', async () => {
    vi.mocked(buildManifest).mockRejectedValueOnce(new Error('bad stats file'));

    await main([]);

    expect(testLogger.error).toHaveBeenCalledWith('Error: bad stats file');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(process.stdout.write).not.toHaveBeenCalled();
  });
});
