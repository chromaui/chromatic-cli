import * as fs from 'fs';
import { vi } from 'vitest';

import { buildManifest } from '../manifest';
import { DirectoryTreeReference, inMemoryProjectFiles } from '../projectFiles';
import { Reference } from './manifestMocks';

// Manifest keys anchor at the project root, so a file inside the project keys as `./src/...` and one
// outside it keeps its `../` prefix (e.g. a sibling package as `../shared/...`).
export const projectRoot = '/repo/packages/ui';

/**
 * The disk the out-of-graph sweep reads, as a tree of absolute directory to entry names. No fixture
 * has these directories on disk, so a suite that cares about them sets this per test and every other
 * suite leaves it empty; see the in-memory adapter in ../projectFiles.
 */
export const directoryTree: DirectoryTreeReference = { current: {} };

export const outOfGraph = {
  configDir: '.storybook',
  staticDirs: ['.storybook/static'],
  projectFiles: inMemoryProjectFiles(directoryTree),
};

/**
 * Spies on `statSync` so only the paths `isPresent` accepts read as a regular file on disk. The
 * shared `fs` mock hardcodes every path present, so a test that needs one absent overrides it here
 * and restores it afterwards.
 *
 * @param isPresent Whether the candidate path has a file on disk.
 *
 * @returns The spy, so the caller can restore it.
 */
export function mockStatSync(isPresent: (candidate: string) => boolean) {
  return vi.spyOn(fs, 'statSync').mockImplementation((candidate) => {
    const path = String(candidate);
    if (!isPresent(path)) return undefined as never;
    // A trailing slash names a directory, which is present on disk but is not a regular file.
    return { isFile: () => !path.endsWith('/') } as fs.Stats;
  });
}

/**
 * Runs `run` with the require-context glob absent from disk. The glob is not a file on disk;
 * everything else is.
 *
 * @param run The test body.
 *
 * @returns The test body's promise.
 */
export function withGlobAbsent(run: () => Promise<void>) {
  const spy = mockStatSync((candidate) => !candidate.includes('lazy'));
  return run().finally(() => spy.mockRestore());
}

/**
 * Runs `run` with the builder's generated entries and require-context globs absent from disk, which
 * is where a real project has no file either.
 *
 * @param run The test body.
 *
 * @returns The test body's promise.
 */
export function withSyntheticAbsent(run: () => Promise<void>) {
  const synthetic = ['storybook-stories.js', 'storybook-config-entry.js', 'lazy'];
  const spy = mockStatSync((candidate) => !synthetic.some((name) => candidate.includes(name)));
  return run().finally(() => spy.mockRestore());
}

/**
 * Builds a manifest whose only Storybook-wide graph entry is the named preview file, with fixed
 * bytes, so two spellings differ by key alone.
 *
 * @param fileHashes The hash per absolute file path, which this sets.
 * @param previewFile The preview file's name within the config directory.
 *
 * @returns The manifest.
 */
export function manifestWithPreview(
  fileHashes: Reference<Record<string, string>>,
  previewFile: string
) {
  fileHashes.current = {
    '/repo/packages/ui/src/Button.stories.tsx': 'S',
    [`/repo/packages/ui/.storybook/${previewFile}`]: 'P',
  };
  return buildManifest(
    {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: `/repo/packages/ui/.storybook/${previewFile}`,
          reasons: [{ moduleName: './storybook-config-entry.js' }],
        },
      ],
    },
    projectRoot,
    outOfGraph
  );
}
