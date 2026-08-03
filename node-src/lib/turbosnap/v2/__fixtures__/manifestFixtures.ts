import * as fs from 'fs';
import { vi } from 'vitest';

import { buildManifest } from '../manifest';
import { Reference } from './manifestMocks';

// Manifest keys anchor at the project root, so a file inside the project keys as `./src/...` and one
// outside it keeps its `../` prefix (e.g. a sibling package as `../shared/...`).
export const projectRoot = '/repo/packages/ui';
export const outOfGraph = { configDir: '.storybook', staticDirs: ['.storybook/static'] };

/**
 * Runs `run` with the require-context glob absent from disk. The glob is not a file on disk;
 * everything else is, and the shared `fs` mock hardcodes `existsSync: () => true`.
 *
 * @param run The test body.
 *
 * @returns The test body's promise.
 */
export function withGlobAbsent(run: () => Promise<void>) {
  const spy = vi
    .spyOn(fs, 'existsSync')
    .mockImplementation((candidate) => !String(candidate).includes('lazy'));
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
  const spy = vi
    .spyOn(fs, 'existsSync')
    .mockImplementation((candidate) => !synthetic.some((name) => String(candidate).includes(name)));
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
