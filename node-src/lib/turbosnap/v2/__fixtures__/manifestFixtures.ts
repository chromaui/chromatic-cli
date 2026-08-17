import { buildManifest } from '../manifest';
import { InMemoryDiskReference, inMemoryProjectFiles } from '../projectFiles';

// Manifest keys anchor at the project root, so a file inside the project keys as `./src/...` and one
// outside it keeps its `../` prefix (e.g. a sibling package as `../shared/...`).
export const projectRoot = '/repo/packages/ui';

// The version the manifest reads off the installed Storybook package. Fixed here, so a Storybook
// release cannot move a manifest these suites assert on.
export const storybookVersion = '9.1.20';

/**
 * The disk the manifest reads: the tree the out-of-graph sweep walks, the content hash of each file
 * and the installed package versions. A suite sets the part its assertion turns on and leaves the
 * rest; see the in-memory adapter in ../projectFiles.
 */
export const disk: InMemoryDiskReference = { current: {} };

export const outOfGraph = {
  configDir: '.storybook',
  staticDirs: ['.storybook/static'],
  projectFiles: inMemoryProjectFiles(disk),
};

/**
 * The context readStatsGraph takes, reading the same in-memory disk. Stats paths are named from the
 * project root here; the cases where they are not have their own suite in index.statsRoot.test.ts.
 */
export const statsContext = {
  projectRoot,
  statsRoot: projectRoot,
  projectFiles: outOfGraph.projectFiles,
};

/** Empties the disk, leaving only the installed Storybook version every manifest needs. */
export function resetDisk() {
  disk.current = { packageVersions: { storybook: storybookVersion } };
}

/**
 * Runs `run` with the paths `isAbsent` names missing from disk. Everything else is a file, so a test
 * names only what a real project has no file for.
 *
 * @param isAbsent Whether the candidate path has no file on disk.
 * @param run The test body.
 *
 * @returns The test body's promise.
 */
export function withAbsent(isAbsent: (candidate: string) => boolean, run: () => Promise<void>) {
  disk.current.isAbsent = isAbsent;
  return run().finally(() => {
    disk.current.isAbsent = undefined;
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
  return withAbsent((candidate) => candidate.includes('lazy'), run);
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
  return withAbsent((candidate) => synthetic.some((name) => candidate.includes(name)), run);
}

/**
 * Builds a manifest whose only Storybook-wide graph entry is the named preview file, with fixed
 * bytes, so two spellings differ by key alone.
 *
 * @param previewFile The preview file's name within the config directory.
 *
 * @returns The manifest.
 */
export function manifestWithPreview(previewFile: string) {
  disk.current.fileHashes = {
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
