import * as Sentry from '@sentry/node';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { Stats } from '../../../types';
import { captureBailException } from '../v1/captureBailException';
import { traceChangedFiles } from './index';
import { InMemoryDiskReference, inMemoryProjectFiles, ProjectFiles } from './projectFiles';

// Only the two boundaries the module cannot describe as a value stay mocked: error reporting, whose
// whole job is a side effect, and the network, faked through the injected client rather than the api
// module so the mutation input the Index receives is the thing asserted. Everything below
// traceChangedFiles — the anchor checks, the manifest, the builder-compatibility gate — runs for real
// against the disk described in `disk`.
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('../v1/captureBailException', () => ({
  captureBailException: vi.fn(() => 'sentry-event-id'),
}));

const repositoryRoot = '/repo';
const projectRoot = '/repo/packages/ui';
const configDirectory = `${projectRoot}/.storybook`;

const STORY = './src/Button.stories.tsx';
const COMPONENT = './src/Button.tsx';
const PREVIEW = './.storybook/preview.ts';
const DEPENDENCY = './node_modules/react/index.js';
const STORIES_ENTRY = './storybook-stories.js';
const CONFIG_ENTRY = './storybook-config-entry.js';

// A builder-vite module in the graph is how the stats identify their builder.
const BUILDER_VITE = '../../node_modules/@storybook/builder-vite/dist/index.js';

// The lazy require-context rspack generates in place of direct story imports, and a generated entry
// at a path the catalogue does not know.
const LAZY_CONTEXT = String.raw`./src|lazy|/^\.\/.*$/|exclude: /[\\/]node_modules[\\/]/|namespace object`;
const UNRECOGNIZED_ENTRY = './future-cache/storybook-stories.js';

// The names a builder generates have no file on disk; everything else the stats mention does, which
// is what keeps a test from having to list every source file its stats name.
const SYNTHETIC = ['storybook-stories.js', 'storybook-config-entry.js', '|lazy|'];

const disk: InMemoryDiskReference = { current: {} };
const projectFiles = inMemoryProjectFiles(disk);

let runQuery: ReturnType<typeof vi.fn>;
// The manifest write is a write, so ProjectFiles does not model it; see manifest.test.ts. A real
// temporary directory is therefore the only honest target, and reading the bytes back is a stronger
// assertion than a spy on writeManifest.
let manifestOutputDirectory: string;

beforeEach(() => {
  disk.current = {
    directories: {
      [configDirectory]: ['main.ts', 'preview.ts', 'static'],
      [`${configDirectory}/static`]: ['logo.svg'],
    },
    packageVersions: { storybook: '9.1.20' },
    isAbsent: (candidate) => SYNTHETIC.some((name) => candidate.includes(name)),
  };
  manifestOutputDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-trace-'));
  runQuery = vi.fn().mockResolvedValue({
    buildUploadHashes: { build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' } },
  });
});

afterEach(() => {
  rmSync(manifestOutputDirectory, { recursive: true, force: true });
});

describe('traceChangedFiles', () => {
  it('refuses to build a manifest when the stats and the anchor disagree', async () => {
    disk.current.directories = {
      ...disk.current.directories,
      '/repo/packages/other/.storybook': ['main.ts'],
    };

    // These stats are Vite's and no builder-vite is installed, so the builder-compatibility gate
    // would bail with `packageNotFound`. Getting the anchor verdict instead is what proves nothing
    // was read off a disproven anchor.
    const result = await trace({
      stats: viteStats(),
      statsPath: '/repo/packages/other/storybook-static/preview-stats.json',
    });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: { anchorMismatch: true, bailSubreason: 'statsFileOutsideProject' },
      },
    });
    expect(Sentry.setContext).toHaveBeenCalledWith(
      'turboSnapAnchorMismatch',
      expect.objectContaining({
        subreason: 'statsFileOutsideProject',
        detail: expect.stringContaining('/repo/packages/other'),
      })
    );
    expect(writtenManifest()).toBeUndefined();
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('bails with a Sentry ID when resolving the stats root fails unexpectedly', async () => {
    const error = new Error('the disk is gone');

    await expect(
      trace({
        projectFiles: diskWhere({
          isFile: () => {
            throw error;
          },
        }),
      })
    ).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          internalError: true,
          bailSubreason: 'anchorCheckFailed',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(error, {
      bailSubreason: 'anchorCheckFailed',
      bailPath: 'getSourceModuleResolution',
    });
  });

  it('bails with a Sentry ID when the anchor check fails unexpectedly', async () => {
    const error = new Error('anchor check exploded');

    await expect(
      trace({
        projectFiles: diskWhere({
          isDirectory: () => {
            throw error;
          },
        }),
      })
    ).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          internalError: true,
          bailSubreason: 'anchorCheckFailed',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(error, {
      bailSubreason: 'anchorCheckFailed',
      bailPath: 'getAnchorMismatchReason',
    });
  });

  it('bails before manifest upload when builder-vite stats are known invalid', async () => {
    disk.current.packageVersions = {
      ...disk.current.packageVersions,
      '@storybook/builder-vite': '10.6.0-alpha.3',
    };

    const result = await trace({ stats: viteStats() });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          untrustedBuilderStats: true,
          bailSubreason: 'unsupportedVersion',
          builderName: '@storybook/builder-vite',
          builderVersion: '10.6.0-alpha.3',
        },
      },
    });
    expect(writtenManifest()).toBeUndefined();
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('bails with a Sentry ID when the builder compatibility check fails unexpectedly', async () => {
    const error = new Error('package metadata is unreadable');

    await expect(
      trace({
        stats: viteStats(),
        projectFiles: diskWhere({
          packageVersion: () => {
            throw error;
          },
        }),
      })
    ).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          internalError: true,
          bailSubreason: 'builderCompatibilityCheckFailed',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(error, {
      bailSubreason: 'builderCompatibilityCheckFailed',
      bailPath: 'getUntrustedBuilderStatsReason',
    });
    expect(writtenManifest()).toBeUndefined();
  });

  it('uploads and writes a manifest when the stats pass compatibility checks', async () => {
    // The stats root the anchor check resolved is the one the manifest keys against, so a
    // repository-root-named stats file would key its stories the same way; index.statsRoot.test.ts
    // pins that end to end.
    await expect(trace()).resolves.toEqual({ status: 'fallback' });

    expect(uploaded()).toEqual({
      buildId: 'build-id',
      storybookHash: expect.any(String),
      storyFileHashes: { [STORY]: expect.any(String) },
    });
    // The three out-of-graph sections the Index gates on, plus the graph-rolled preview entry.
    expect(writtenManifest().storybookFiles).toEqual({
      [PREVIEW]: expect.any(String),
      storybookVersion: '9.1.20',
      storybookConfig: expect.any(String),
      staticFiles: expect.any(String),
    });
    expect(writtenManifest().storybookConfigFiles).toEqual({
      './.storybook/main.ts': expect.any(String),
      [PREVIEW]: expect.any(String),
    });
    expect(writtenManifest().staticFiles).toEqual({
      './.storybook/static/logo.svg': expect.any(String),
    });
  });

  it('bails with indexUnavailable when the Index request times out', async () => {
    runQuery.mockRejectedValue(
      Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })
    );

    await expect(trace()).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          indexUnavailable: true,
          bailSubreason: 'networkError',
        },
      },
    });
    expect(writtenManifest().storyFiles).toEqual({ [STORY]: expect.any(String) });
    expect(captureBailException).not.toHaveBeenCalled();
  });

  it('leaves the indexUnavailable subreason absent when the request error is unclassified', async () => {
    runQuery.mockRejectedValue(new Error('request failed unexpectedly'));

    await expect(trace()).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { indexUnavailable: true } },
    });
    expect(captureBailException).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('bails with a fingerprinted Sentry event when the Index rejects our story file hashes', async () => {
    runQuery.mockResolvedValue({
      buildUploadHashes: {
        errors: [
          { __typename: 'InvalidStoryFileHashesError', message: 'Invalid story file hashes.' },
        ],
      },
    });

    await expect(trace()).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          indexContractViolation: true,
          bailSubreason: 'invalidStoryFileHashes',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(expect.any(Error), {
      bailSubreason: 'invalidStoryFileHashes',
      bailPath: 'determineChangedFiles',
    });
    expect(writtenManifest().storyFiles).toEqual({ [STORY]: expect.any(String) });
  });

  it('bails with a fingerprinted Sentry event when we upload at the wrong build status', async () => {
    runQuery.mockResolvedValue({
      buildUploadHashes: {
        errors: [
          {
            __typename: 'InvalidUploadHashesBuildStatusError',
            message: 'Uploading hashes is only allowed for announced builds.',
          },
        ],
      },
    });

    await expect(trace()).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          indexContractViolation: true,
          bailSubreason: 'invalidBuildStatus',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(expect.any(Error), {
      bailSubreason: 'invalidBuildStatus',
      bailPath: 'determineChangedFiles',
    });
  });

  it('bails with a fingerprinted Sentry event when the response matches neither union member', async () => {
    runQuery.mockResolvedValue({ buildUploadHashes: {} });

    await expect(trace()).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          indexContractViolation: true,
          bailSubreason: 'invalidResponse',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(expect.any(Error), {
      bailSubreason: 'invalidResponse',
      bailPath: 'determineChangedFiles',
    });
  });

  it('bails with a Sentry ID when manifest construction fails', async () => {
    // A file the sweep found and then could not read is the one unreadability the module treats as a
    // bug rather than an answer; see ProjectFiles.
    const error = new Error('Could not hash /repo/packages/ui/src/Button.stories.tsx');

    await expect(
      trace({
        projectFiles: diskWhere({
          hashAll: () => {
            throw error;
          },
        }),
      })
    ).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          internalError: true,
          bailSubreason: 'manifestBuildFailed',
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(error, {
      bailSubreason: 'manifestBuildFailed',
      bailPath: 'buildManifest',
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('bails without uploading when the config directory resolves to zero files', async () => {
    disk.current.directories = {};

    const result = await trace();

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStorybookConfigFiles: true,
        },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(writtenManifest().storybookConfigFiles).toEqual({});
  });

  it('bails when the prebuilt metadata declares static directories that source did not resolve', async () => {
    const result = await trace({ staticDirs: [] });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          unresolvedStaticDirectories: true,
        },
      },
    });
    expect(writtenManifest()).toBeUndefined();
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('reports the empty config directory rather than the empty graph when both hold', async () => {
    disk.current.directories = {};

    await expect(trace({ stats: stats({ stories: false }) })).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStorybookConfigFiles: true } },
    });
  });

  it('bails without uploading when configured static directories resolve to zero files', async () => {
    disk.current.directories = { [configDirectory]: ['main.ts', 'preview.ts'] };

    const result = await trace();

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStaticFiles: true,
        },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(writtenManifest().staticFiles).toEqual({});
  });

  it('allows an empty static section when no static directories are configured', async () => {
    await expect(trace({ staticDirs: [], staticDirsDeclared: false })).resolves.toEqual({
      status: 'fallback',
    });

    expect(uploaded().storyFileHashes).toEqual({ [STORY]: expect.any(String) });
    expect(writtenManifest().storybookFiles['staticFiles']).toBeUndefined();
  });

  it('bails without uploading when the graph contains no node_modules files', async () => {
    const result = await trace({ stats: stats({ dependency: false }) });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noNodeModulesFiles: true,
        },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(writtenManifest().storyFiles).toEqual({ [STORY]: expect.any(String) });
  });

  it('reports the empty config directory rather than the missing dependencies when both hold', async () => {
    disk.current.directories = {};

    await expect(trace({ stats: stats({ dependency: false }) })).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStorybookConfigFiles: true } },
    });
  });

  it('reports the missing dependencies rather than the empty graph when both hold', async () => {
    await expect(trace({ stats: stats({ stories: false, dependency: false }) })).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noNodeModulesFiles: true } },
    });
  });

  it('bails without uploading when the graph contains no story files', async () => {
    const result = await trace({ stats: stats({ stories: false }) });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStoryFiles: true,
        },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(writtenManifest().storyFiles).toEqual({});
  });

  it('reports an unrecognized story entry to Sentry instead of calling the project storyless', async () => {
    await expect(trace({ stats: relocatedEntryStats() })).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          unrecognizedStoryEntry: true,
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(UNRECOGNIZED_ENTRY) }),
      { bailSubreason: 'unrecognizedStoryEntry', bailPath: 'getEmptySectionBail' }
    );
    expect(runQuery).not.toHaveBeenCalled();
    expect(writtenManifest().unrecognizedStoryEntries).toEqual([UNRECOGNIZED_ENTRY]);
  });

  it('preserves the no-story bail when writing its diagnostic manifest fails', async () => {
    await expect(
      trace({
        stats: stats({ stories: false }),
        manifestOutputDirectory: path.join(manifestOutputDirectory, 'never-created'),
      })
    ).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStoryFiles: true } },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { turbo_snap_v2_diagnostic: 'writeManifest' },
    });
  });
});

/**
 * Runs the entry point against the disk in `disk`, with the fake client as its only network.
 *
 * @param overrides The input fields this test's assertion turns on.
 *
 * @returns The TurboSnap result.
 */
function trace(overrides: Partial<Parameters<typeof traceChangedFiles>[0]> = {}) {
  return traceChangedFiles({
    graphqlClient: { runQuery } as unknown as GraphQLClient,
    buildId: 'build-id',
    stats: stats(),
    statsPath: `${projectRoot}/storybook-static/preview-stats.json`,
    manifestOutputDirectory,
    repositoryRoot,
    projectRoot,
    configDir: '.storybook',
    staticDirs: ['.storybook/static'],
    staticDirsDeclared: true,
    projectFiles,
    ...overrides,
  });
}

/**
 * A stats file describing the project on disk.
 *
 * @param options Which properties of a healthy graph to keep.
 * @param options.stories Whether the source module is imported by the stories entry, which is what
 * makes it a story file rather than plain source.
 * @param options.dependency Whether the graph names the one `node_modules` file that makes a
 * dependency upgrade visible.
 *
 * @returns The stats file.
 */
function stats({ stories = true, dependency = true } = {}): Stats {
  const source = stories ? STORY : COMPONENT;

  return {
    modules: [
      { id: 1, name: source, reasons: [{ moduleName: stories ? STORIES_ENTRY : PREVIEW }] },
      { id: 2, name: PREVIEW, reasons: [{ moduleName: CONFIG_ENTRY }] },
      ...(dependency ? [{ id: 3, name: DEPENDENCY, reasons: [{ moduleName: source }] }] : []),
    ],
  };
}

/** A healthy graph whose builder is identified as Vite by the builder's own module. */
function viteStats(): Stats {
  return {
    modules: [
      ...stats().modules,
      { id: 4, name: BUILDER_VITE, reasons: [{ moduleName: PREVIEW }] },
    ],
  };
}

/** A graph whose stories are reached through a lazy context the catalogue does not recognize. */
function relocatedEntryStats(): Stats {
  return {
    modules: [
      { id: 1, name: STORY, reasons: [{ moduleName: LAZY_CONTEXT }] },
      { id: 2, name: LAZY_CONTEXT, reasons: [{ moduleName: UNRECOGNIZED_ENTRY }] },
      { id: 3, name: PREVIEW, reasons: [{ moduleName: CONFIG_ENTRY }] },
      { id: 4, name: DEPENDENCY, reasons: [{ moduleName: STORY }] },
    ],
  };
}

/**
 * The disk with some methods replaced, for the paths that only a failing read reaches.
 *
 * @param overrides The methods to replace.
 *
 * @returns The adapter.
 */
function diskWhere(overrides: Partial<ProjectFiles>): ProjectFiles {
  return { ...projectFiles, ...overrides };
}

/** The mutation input the Index received, or undefined when nothing was uploaded. */
function uploaded() {
  return runQuery.mock.calls[0]?.[1]?.input;
}

/** The diagnostic manifest as written, or undefined when none was written. */
function writtenManifest() {
  const manifestPath = path.join(manifestOutputDirectory, 'turbosnap-manifest.json');
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined;
}
