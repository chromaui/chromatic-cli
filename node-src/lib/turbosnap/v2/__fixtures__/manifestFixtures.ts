import TestLogger from '../../../testLogger';
import { buildManifest } from '../manifest';
import { ManifestInput } from '../manifestInput';
import { InMemoryDisk, inMemoryProjectFiles } from '../projectFiles.fake';

// Manifest keys anchor at the project root, so a file inside the project keys as `./src/...` and one
// outside it keeps its `../` prefix (e.g. a sibling package as `../shared/...`).
export const projectRoot = '/repo/packages/ui';

// The version the manifest reads off the installed Storybook package. Fixed here, so a Storybook
// release cannot move a manifest these suites assert on.
export const storybookVersion = '9.1.20';

/** A fresh disk and the input that reads it, so each test owns its own state and nothing leaks. */
export interface ManifestFixture {
  disk: InMemoryDisk;
  input: ManifestInput;
}

/**
 * Builds a fresh in-memory disk from the given description and wires the adapters that read it. A
 * test constructs its own, so there is no shared disk to reset between tests. The returned `disk` is
 * still mutable, for the before/after-edit suites that build, change a hash, and build again.
 *
 * @param overrides The disk to read; the installed Storybook version is seeded unless overridden.
 *
 * @returns The disk and the manifest input that reads it.
 */
export function createFixture(overrides: InMemoryDisk = {}): ManifestFixture {
  const disk: InMemoryDisk = { packageVersions: { storybook: storybookVersion }, ...overrides };
  return {
    disk,
    input: {
      log: new TestLogger(),
      projectRoot,
      configDir: `${projectRoot}/.storybook`,
      staticDirs: [`${projectRoot}/.storybook/static`],
      projectFiles: inMemoryProjectFiles(disk),
    },
  };
}

/**
 * An `isAbsent` predicate for {@link createFixture}: the require-context glob is not a file on disk;
 * everything else is.
 *
 * @param candidate The absolute path to test.
 *
 * @returns Whether the path has no file on disk.
 */
export function globAbsent(candidate: string): boolean {
  return candidate.includes('lazy');
}

/**
 * An `isAbsent` predicate for {@link createFixture}: the builder's generated entries and
 * require-context globs, which is where a real project has no file on disk either.
 *
 * @param candidate The absolute path to test.
 *
 * @returns Whether the path has no file on disk.
 */
export function syntheticAbsent(candidate: string): boolean {
  return ['storybook-stories.js', 'storybook-config-entry.js', 'lazy'].some((name) =>
    candidate.includes(name)
  );
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
  const { input } = createFixture({
    fileHashes: {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      [`/repo/packages/ui/.storybook/${previewFile}`]: 'P',
    },
  });
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
    input
  );
}
