import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { Stats } from '../../../types';
import { traceChangedFiles } from './index';
import { ProjectFiles } from './projectFiles';
import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';

// The only boundary the module cannot describe as a value stays mocked: error reporting, whose whole
// job is a side effect. The network is faked through the injected client rather than the api module,
// so the mutation input the Index receives is the thing asserted. Everything below traceChangedFiles
// — the manifest build and its serialization — runs for real against the disk described in `disk`.
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

const projectRoot = '/repo/packages/ui';
const configDirectory = `${projectRoot}/.storybook`;

const STORY = './src/Button.stories.tsx';
const PREVIEW = './.storybook/preview.ts';
const DEPENDENCY = './node_modules/react/index.js';
const STORIES_ENTRY = './storybook-stories.js';
const CONFIG_ENTRY = './storybook-config-entry.js';

// The names a builder generates have no file on disk; everything else the stats mention does, which
// is what keeps a test from having to list every source file its stats name.
const SYNTHETIC = ['storybook-stories.js', 'storybook-config-entry.js', '|lazy|'];

const manifestPath = '/repo/packages/ui/storybook-static/.chromatic/turbosnap-manifest.json';

function setup() {
  const disk: InMemoryDisk = {
    directories: {
      [configDirectory]: ['main.ts', 'preview.ts', 'static'],
      [`${configDirectory}/static`]: ['logo.svg'],
    },
    packageVersions: { storybook: '9.1.20' },
    isAbsent: (candidate) => SYNTHETIC.some((name) => candidate.includes(name)),
  };
  const runQuery = vi.fn().mockResolvedValue({
    buildUploadHashes: { build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' } },
  });
  return { disk, projectFiles: inMemoryProjectFiles(disk), runQuery };
}

type Fixture = ReturnType<typeof setup>;

describe('traceChangedFiles', () => {
  it('uploads and writes a manifest when the stats build a healthy manifest', async () => {
    const fixture = setup();

    await expect(trace(fixture)).resolves.toEqual({ status: 'fallback' });

    expect(uploaded(fixture)).toEqual({
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
    expect(writtenManifest(fixture).storybookConfigHashes).toEqual({
      preview: expect.any(String),
      storybookVersion: '9.1.20',
      storybookConfigFiles: expect.any(String),
      staticFiles: expect.any(String),
    });
    expect(writtenManifest(fixture).storybookConfigFiles).toEqual({
      './.storybook/main.ts': expect.any(String),
      [PREVIEW]: expect.any(String),
    });
    expect(writtenManifest(fixture).staticFiles).toEqual({
      './.storybook/static/logo.svg': expect.any(String),
    });
    expect(writtenManifest(fixture).storyFiles).toEqual({ [STORY]: expect.any(String) });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('falls back without uploading when manifest construction fails', async () => {
    const fixture = setup();
    // A file the sweep found and then could not read is the one unreadability the module treats as a
    // bug rather than an answer; see ProjectFiles.
    const error = new Error('Could not hash /repo/packages/ui/src/Button.stories.tsx');

    await expect(
      trace(fixture, {
        hashAll: () => {
          throw error;
        },
      })
    ).resolves.toEqual({ status: 'fallback' });

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(fixture.runQuery).not.toHaveBeenCalled();
  });

  it('falls back without uploading when writing the manifest fails', async () => {
    const fixture = setup();
    const error = new Error('the manifest directory is gone');

    await expect(
      trace(fixture, {
        writeFile: () => {
          throw error;
        },
      })
    ).resolves.toEqual({ status: 'fallback' });

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(fixture.runQuery).not.toHaveBeenCalled();
  });

  it('falls back when uploading the hashes to the Index fails', async () => {
    const fixture = setup();
    const error = Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
    fixture.runQuery.mockRejectedValue(error);

    await expect(trace(fixture)).resolves.toEqual({ status: 'fallback' });

    expect(Sentry.captureException).toHaveBeenCalled();
    // The manifest is still written before the upload, so the failure remains debuggable.
    expect(writtenManifest(fixture).storyFiles).toEqual({ [STORY]: expect.any(String) });
  });
});

// Runs the entry point against the fixture's disk, with the fake client as its only network. A
// `patchFiles` override replaces adapter methods for the paths only a failing read or write reaches.
function trace({ projectFiles, runQuery }: Fixture, patchFiles: Partial<ProjectFiles> = {}) {
  return traceChangedFiles({
    graphqlClient: { runQuery } as unknown as GraphQLClient,
    buildId: 'build-id',
    stats: stats(),
    manifestPath,
    projectRoot,
    configDir: configDirectory,
    staticDirs: [`${configDirectory}/static`],
    projectFiles: { ...projectFiles, ...patchFiles },
  });
}

// A stats file describing a healthy graph: a story imported by the stories entry, the preview
// imported by the config entry, and the one `node_modules` file that makes a dependency visible.
function stats(): Stats {
  return {
    modules: [
      { id: 1, name: STORY, reasons: [{ moduleName: STORIES_ENTRY }] },
      { id: 2, name: PREVIEW, reasons: [{ moduleName: CONFIG_ENTRY }] },
      { id: 3, name: DEPENDENCY, reasons: [{ moduleName: STORY }] },
    ],
  };
}

// The mutation input the Index received, or undefined when nothing was uploaded.
function uploaded({ runQuery }: Fixture) {
  return runQuery.mock.calls[0]?.[1]?.input;
}

// The diagnostic manifest as written, or undefined when none was written.
function writtenManifest({ disk }: Fixture) {
  const contents = disk.writtenFiles?.[manifestPath];
  return contents === undefined ? undefined : JSON.parse(contents);
}
