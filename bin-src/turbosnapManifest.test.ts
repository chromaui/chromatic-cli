import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { Stats } from '../node-src/types';
import { main } from './turbosnapManifest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: () => true,
}));

const { statsRef } = vi.hoisted(() => ({ statsRef: { current: {} as Stats } }));

vi.mock('../node-src/tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(() => Promise.resolve(statsRef.current)),
}));

vi.mock('../node-src/git/git', () => ({
  getRepositoryRoot: () => Promise.resolve('/repo'),
}));

vi.mock('../node-src/lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'x']))),
}));

describe('turbosnap-manifest command', () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    statsRef.current = {
      modules: [
        {
          id: 1,
          name: '/repo/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: '/repo/src/helper.ts',
          reasons: [{ moduleName: '/repo/src/Button.stories.tsx' }],
        },
      ],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the serialized manifest as JSON to stdout', async () => {
    await main(['-s', 'preview-stats.json']);

    expect(stdout).toHaveBeenCalledTimes(1);
    const written = stdout.mock.calls[0][0] as string;
    const manifest = JSON.parse(written);

    expect(typeof manifest.storybookHash).toBe('string');
    expect(Object.keys(manifest.storyFiles)).toEqual(['src/Button.stories.tsx']);
    expect(manifest.files['src/Button.stories.tsx'].dependencies).toEqual(['src/helper.ts']);
  });

  it('resolves the stats file against the storybook base directory', async () => {
    await main(['-b', 'packages/ui']);

    // Base dir stacks onto the repo root, and the default stats path stacks onto that, so passing
    // only --storybook-base-dir finds <root>/<baseDir>/storybook-static/preview-stats.json.
    expect(readStatsFile).toHaveBeenCalledWith(
      '/repo/packages/ui/storybook-static/preview-stats.json'
    );
  });
});
