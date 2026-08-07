import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRepositoryRoot } from '../node-src/git/git';
import { readStatsFile } from '../node-src/tasks/readStatsFile';
import { Stats } from '../node-src/types';
import { main } from './turbosnapManifest';

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: (candidate: unknown) => existsRef.current(String(candidate)),
  // A trailing slash names a directory: present on disk, but not a regular file. Absence reads as
  // undefined rather than a throw because every caller passes `{ throwIfNoEntry: false }`.
  statSync: (candidate: unknown) => {
    const absolutePath = String(candidate);
    if (!existsRef.current(absolutePath)) return undefined;
    return {
      isFile: () => !absolutePath.endsWith('/'),
      isDirectory: () => absolutePath.endsWith('/'),
    };
  },
}));

// `existsRef` decides which absolute paths are on disk, which is what picks the root relative stats
// names are anchored at.
const { statsRef, existsRef } = vi.hoisted(() => ({
  statsRef: { current: {} as Stats },
  existsRef: { current: (_candidate: string): boolean => true },
}));

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

describe('turbosnap-manifest command', () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    existsRef.current = () => true;
    // Re-stated per test because a mockResolvedValue set in one test outlives it.
    vi.mocked(getRepositoryRoot).mockResolvedValue('/repo');
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
    await main(['-s', 'preview-stats.json', '-b', '.']);

    expect(stdout).toHaveBeenCalledTimes(1);
    const written = stdout.mock.calls[0][0] as string;
    const manifest = JSON.parse(written);

    expect(typeof manifest.storybookHash).toBe('string');
    expect(Object.keys(manifest.storyFiles)).toEqual(['./src/Button.stories.tsx']);
    expect(manifest.files['./src/Button.stories.tsx'].dependencies).toEqual(['./src/helper.ts']);
    // The version survives serialization as a readable string, so the emitted manifest itself says
    // which Storybook produced the build.
    expect(manifest.storybookFiles['storybookVersion']).toBe('9.1.20');
  });

  it('resolves the stats file against the storybook base directory', async () => {
    await main(['-b', 'packages/ui']);

    // Base dir stacks onto the repo root, and the default stats path stacks onto that, so passing
    // only --storybook-base-dir finds <root>/<baseDir>/storybook-static/preview-stats.json.
    expect(readStatsFile).toHaveBeenCalledWith(
      '/repo/packages/ui/storybook-static/preview-stats.json'
    );
  });

  it('defaults the base directory the way production does, from the cwd and the repo root', async () => {
    vi.mocked(getRepositoryRoot).mockResolvedValue(path.dirname(process.cwd()));

    await main([]);

    expect(readStatsFile).toHaveBeenCalledWith(
      path.join(process.cwd(), 'storybook-static/preview-stats.json')
    );
  });

  // Builders that relativise stats names from the command's working directory anchor at the
  // repository root, which is the root production resolves and hands to the manifest.
  it('anchors relative stats names at the repository root when they only resolve there', async () => {
    existsRef.current = (candidate) => candidate.startsWith('/repo/packages/ui/src/');
    statsRef.current = {
      modules: [
        {
          id: 1,
          name: './packages/ui/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: './packages/ui/src/helper.ts',
          reasons: [{ moduleName: './packages/ui/src/Button.stories.tsx' }],
        },
      ],
    };

    await main(['-b', 'packages/ui']);

    const manifest = JSON.parse(stdout.mock.calls[0][0] as string);
    expect(Object.keys(manifest.storyFiles)).toEqual(['./src/Button.stories.tsx']);
    expect(manifest.files['./src/Button.stories.tsx'].dependencies).toEqual(['./src/helper.ts']);
  });
});
