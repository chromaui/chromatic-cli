import * as Sentry from '@sentry/node';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { Stats } from '../../../types';
import { captureBailException } from '../v1/captureBailException';
import { traceChangedFiles } from './index';
import { ProjectFiles } from './projectFiles';
import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';

// Only the two boundaries the module cannot describe as a value stay mocked: error reporting, whose
// whole job is a side effect, and the network, faked through the injected client rather than the api
// module so the mutation input the Index receives is the thing asserted. Everything below
// traceChangedFiles — the manifest and the emptiness guards — runs for real against the disk
// described in `disk`.
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('../v1/captureBailException', () => ({
  captureBailException: vi.fn(() => 'sentry-event-id'),
}));

const projectRoot = '/repo/packages/ui';
const configDirectory = `${projectRoot}/.storybook`;

const STORY = './src/Button.stories.tsx';
const COMPONENT = './src/Button.tsx';
const PREVIEW = './.storybook/preview.ts';
const DEPENDENCY = './node_modules/react/index.js';
const STORIES_ENTRY = './storybook-stories.js';
const CONFIG_ENTRY = './storybook-config-entry.js';

// The names a builder generates have no file on disk; everything else the stats mention does, which
// is what keeps a test from having to list every source file its stats name.
const SYNTHETIC = ['storybook-stories.js', 'storybook-config-entry.js', '|lazy|'];

// The manifest write goes through ProjectFiles, so the fake records it into `disk.writtenFiles`;
// reading those bytes back is a stronger assertion than a spy on writeManifest. See writtenManifest.
const manifestOutputDirectory = '/repo/packages/ui/storybook-static';

// A fresh disk describing a healthy project and the adapter that reads it, rebuilt for each test so
// none leaks into the next; see createFixture in __fixtures__/manifestFixtures.ts.
let disk: InMemoryDisk;
let projectFiles: ProjectFiles;
let runQuery: ReturnType<typeof vi.fn>;

/**
 * Builds a fresh in-memory disk describing a healthy project and the adapter that reads it, so each
 * test owns its own state.
 *
 * @param overrides Disk fields to replace on top of the healthy defaults.
 *
 * @returns The disk and the adapter that reads it.
 */
function createFixture(overrides: InMemoryDisk = {}) {
  const nextDisk: InMemoryDisk = {
    directories: {
      [configDirectory]: ['main.ts', 'preview.ts', 'static'],
      [`${configDirectory}/static`]: ['logo.svg'],
    },
    packageVersions: { storybook: '9.1.20' },
    isAbsent: (candidate) => SYNTHETIC.some((name) => candidate.includes(name)),
    ...overrides,
  };
  return { disk: nextDisk, projectFiles: inMemoryProjectFiles(nextDisk) };
}

beforeEach(() => {
  ({ disk, projectFiles } = createFixture());
  runQuery = vi.fn().mockResolvedValue({
    buildUploadHashes: { build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' } },
  });
});

describe('traceChangedFiles', () => {
  it('uploads and writes a manifest when the stats build a healthy manifest', async () => {
    await expect(trace()).resolves.toEqual({ status: 'fallback' });

    expect(uploaded()).toEqual({
      buildId: 'build-id',
      storybookHash: expect.any(String),
      storybookConfigHashes: {
        preview: expect.any(String),
        storybookVersion: '9.1.20',
        storybookConfigFiles: expect.any(String),
        staticFiles: expect.any(String),
      },
      storyFileHashes: { [STORY]: expect.any(String) },
    });
    // The three out-of-graph sections the Index gates on, plus the graph-rolled preview entry.
    expect(writtenManifest().storybookFileHashes).toEqual({
      preview: expect.any(String),
      storybookVersion: '9.1.20',
      storybookConfigFiles: expect.any(String),
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
      bailPath: 'uploadHashes',
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
      bailPath: 'uploadHashes',
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
      bailPath: 'uploadHashes',
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
    disk.directories = {};

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
    disk.directories = {};

    await expect(trace({ stats: stats({ stories: false }) })).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStorybookConfigFiles: true } },
    });
  });

  it('bails without uploading when configured static directories resolve to zero files', async () => {
    disk.directories = { [configDirectory]: ['main.ts', 'preview.ts'] };

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
    expect(writtenManifest().storybookFileHashes['staticFiles']).toBeUndefined();
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
    disk.directories = {};

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

  it('preserves the no-story bail when writing its diagnostic manifest fails', async () => {
    await expect(
      trace({
        stats: stats({ stories: false }),
        projectFiles: diskWhere({
          writeFile: () => {
            throw new Error('the manifest directory is gone');
          },
        }),
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
    manifestOutputDirectory,
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
  const contents =
    disk.writtenFiles?.[path.join(manifestOutputDirectory, 'turbosnap-manifest.json')];
  return contents === undefined ? undefined : JSON.parse(contents);
}
