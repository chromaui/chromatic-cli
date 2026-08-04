import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureBailException } from '../v1/captureBailException';
import { determineChangedFiles } from './api';
import { getUntrustedBuilderStatsReason } from './builderViteCompatibility';
import { traceChangedFiles } from './index';
import { buildManifest, countNodeModulesFiles, writeManifest } from './manifest';
import { getAnchorMismatchReason } from './statsAnchor';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('../v1/captureBailException', () => ({
  captureBailException: vi.fn(() => 'sentry-event-id'),
}));

vi.mock('./builderViteCompatibility', () => ({
  getUntrustedBuilderStatsReason: vi.fn(),
}));

vi.mock('./manifest', () => ({
  buildManifest: vi.fn(),
  countNodeModulesFiles: vi.fn(),
  writeManifest: vi.fn(),
}));

vi.mock('./api', () => ({
  determineChangedFiles: vi.fn(),
}));

vi.mock('./statsAnchor', () => ({
  getAnchorMismatchReason: vi.fn(),
}));

const input = {
  graphqlClient: {} as any,
  buildId: 'build-id',
  stats: { modules: [] },
  statsPath: '/repo/packages/ui/storybook-static/preview-stats.json',
  manifestOutputDirectory: '/repo/packages/ui/.chromatic',
  projectRoot: '/repo/packages/ui',
  configDir: '.storybook',
  staticDirs: ['.storybook/static'],
  staticDirsDeclared: true,
};

const manifest = {
  storybookHash: 'hash',
  storyFileHashes: new Map([['./src/Button.stories.tsx', 'story-hash']]),
  outOfGraphFiles: {
    storybookConfigFiles: new Map([['.storybook/main.ts', 'config-hash']]),
    staticFiles: new Map([['./.storybook/static/logo.svg', 'static-hash']]),
  },
};

beforeEach(() => {
  vi.mocked(getUntrustedBuilderStatsReason).mockReturnValue(undefined);
  vi.mocked(getAnchorMismatchReason).mockReturnValue(undefined);
  vi.mocked(buildManifest).mockResolvedValue(manifest as any);
  // A healthy graph, matching the `ui` fixture's count. Zero is the only interesting other value.
  vi.mocked(countNodeModulesFiles).mockReturnValue(30);
  vi.mocked(determineChangedFiles).mockResolvedValue({
    build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' },
  });
});

describe('traceChangedFiles', () => {
  it('refuses to build a manifest when the stats and the anchor disagree', async () => {
    vi.mocked(getAnchorMismatchReason).mockReturnValue({
      subreason: 'statsFileOutsideProject',
      detail: 'the stats file lives in the Storybook project /repo/packages/other',
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: { anchorMismatch: true, bailSubreason: 'statsFileOutsideProject' },
      },
    });
    // Nothing may be read off a disproven anchor, including the builder version.
    expect(getUntrustedBuilderStatsReason).not.toHaveBeenCalled();
    expect(buildManifest).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('bails with a Sentry ID when the anchor check fails unexpectedly', async () => {
    const error = new Error('anchor check exploded');
    vi.mocked(getAnchorMismatchReason).mockImplementation(() => {
      throw error;
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    vi.mocked(getUntrustedBuilderStatsReason).mockReturnValue({
      reason: 'untrustedBuilderStats',
      subreason: 'unsupportedVersion',
      builderName: '@storybook/builder-vite',
      builderVersion: '10.6.0-alpha.3',
    });

    const result = await traceChangedFiles(input);

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
    expect(buildManifest).not.toHaveBeenCalled();
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  it('bails with a Sentry ID when the builder compatibility check fails unexpectedly', async () => {
    const error = new Error('package metadata is unreadable');
    vi.mocked(getUntrustedBuilderStatsReason).mockImplementation(() => {
      throw error;
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    expect(buildManifest).not.toHaveBeenCalled();
  });

  it('uploads and writes a manifest when the stats pass compatibility checks', async () => {
    await traceChangedFiles(input);

    expect(buildManifest).toHaveBeenCalledWith({ modules: [] }, '/repo/packages/ui', {
      configDir: '.storybook',
      staticDirs: ['.storybook/static'],
    });
    expect(determineChangedFiles).toHaveBeenCalledWith(input.graphqlClient, 'build-id', manifest);
    expect(writeManifest).toHaveBeenCalledWith(manifest, '/repo/packages/ui/.chromatic');
  });

  it('bails with indexUnavailable when the Index request times out', async () => {
    vi.mocked(determineChangedFiles).mockRejectedValue(
      Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })
    );

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          indexUnavailable: true,
          bailSubreason: 'networkError',
        },
      },
    });
    expect(writeManifest).toHaveBeenCalledWith(manifest, '/repo/packages/ui/.chromatic');
    expect(captureBailException).not.toHaveBeenCalled();
  });

  it('leaves the indexUnavailable subreason absent when the request error is unclassified', async () => {
    vi.mocked(determineChangedFiles).mockRejectedValue(new Error('request failed unexpectedly'));

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { indexUnavailable: true } },
    });
    expect(captureBailException).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('bails with a fingerprinted Sentry event when the Index rejects our story file hashes', async () => {
    vi.mocked(determineChangedFiles).mockResolvedValue({
      errors: [
        { __typename: 'InvalidStoryFileHashesError', message: 'Invalid story file hashes.' },
      ],
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    expect(writeManifest).toHaveBeenCalledWith(manifest, '/repo/packages/ui/.chromatic');
  });

  it('bails with a fingerprinted Sentry event when we upload at the wrong build status', async () => {
    vi.mocked(determineChangedFiles).mockResolvedValue({
      errors: [
        {
          __typename: 'InvalidUploadHashesBuildStatusError',
          message: 'Uploading hashes is only allowed for announced builds.',
        },
      ],
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    vi.mocked(determineChangedFiles).mockResolvedValue({});

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    const error = new Error('hashing failed');
    vi.mocked(buildManifest).mockRejectedValue(error);

    await expect(traceChangedFiles(input)).resolves.toEqual({
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
    expect(determineChangedFiles).not.toHaveBeenCalled();
  });

  it('bails without uploading when the config directory resolves to zero files', async () => {
    const configless = {
      ...manifest,
      outOfGraphFiles: { storybookConfigFiles: new Map(), staticFiles: new Map() },
    };
    vi.mocked(buildManifest).mockResolvedValue(configless as any);

    const result = await traceChangedFiles(input);

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStorybookConfigFiles: true,
        },
      },
    });
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(configless, '/repo/packages/ui/.chromatic');
  });

  it('bails when the prebuilt metadata declares static directories that source did not resolve', async () => {
    const result = await traceChangedFiles({ ...input, staticDirs: [] });

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          unresolvedStaticDirectories: true,
        },
      },
    });
    expect(buildManifest).not.toHaveBeenCalled();
    expect(determineChangedFiles).not.toHaveBeenCalled();
  });

  it('reports the empty config directory rather than the empty graph when both hold', async () => {
    const empty = {
      ...manifest,
      storyFileHashes: new Map(),
      outOfGraphFiles: { storybookConfigFiles: new Map(), staticFiles: new Map() },
    };
    vi.mocked(buildManifest).mockResolvedValue(empty as any);

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStorybookConfigFiles: true } },
    });
  });

  it('bails without uploading when configured static directories resolve to zero files', async () => {
    const staticless = {
      ...manifest,
      outOfGraphFiles: { ...manifest.outOfGraphFiles, staticFiles: new Map() },
    };
    vi.mocked(buildManifest).mockResolvedValue(staticless as any);

    const result = await traceChangedFiles(input);

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStaticFiles: true,
        },
      },
    });
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(staticless, '/repo/packages/ui/.chromatic');
  });

  it('allows an empty static section when no static directories are configured', async () => {
    const staticless = {
      ...manifest,
      outOfGraphFiles: { ...manifest.outOfGraphFiles, staticFiles: new Map() },
    };
    vi.mocked(buildManifest).mockResolvedValue(staticless as any);

    await expect(
      traceChangedFiles({ ...input, staticDirs: [], staticDirsDeclared: false })
    ).resolves.toEqual({
      status: 'fallback',
    });
    expect(determineChangedFiles).toHaveBeenCalledWith(input.graphqlClient, 'build-id', staticless);
  });

  it('bails without uploading when the graph contains no node_modules files', async () => {
    vi.mocked(countNodeModulesFiles).mockReturnValue(0);

    const result = await traceChangedFiles(input);

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noNodeModulesFiles: true,
        },
      },
    });
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(manifest, '/repo/packages/ui/.chromatic');
  });

  it('reports the empty config directory rather than the missing dependencies when both hold', async () => {
    const configless = {
      ...manifest,
      outOfGraphFiles: { storybookConfigFiles: new Map(), staticFiles: new Map() },
    };
    vi.mocked(buildManifest).mockResolvedValue(configless as any);
    vi.mocked(countNodeModulesFiles).mockReturnValue(0);

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStorybookConfigFiles: true } },
    });
  });

  it('reports the missing dependencies rather than the empty graph when both hold', async () => {
    vi.mocked(buildManifest).mockResolvedValue({ ...manifest, storyFileHashes: new Map() } as any);
    vi.mocked(countNodeModulesFiles).mockReturnValue(0);

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noNodeModulesFiles: true } },
    });
  });

  it('bails without uploading when the graph contains no story files', async () => {
    const storyless = { ...manifest, storyFileHashes: new Map() };
    vi.mocked(buildManifest).mockResolvedValue(storyless as any);

    const result = await traceChangedFiles(input);

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          noStoryFiles: true,
        },
      },
    });
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(storyless, '/repo/packages/ui/.chromatic');
  });

  it('reports an unrecognized story entry to Sentry instead of calling the project storyless', async () => {
    const storyless = {
      ...manifest,
      storyFileHashes: new Map(),
      unrecognizedStoryEntries: ['./future-cache/storybook-stories.js'],
    };
    vi.mocked(buildManifest).mockResolvedValue(storyless as any);

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: {
          unrecognizedStoryEntry: true,
          sentryEventId: 'sentry-event-id',
        },
      },
    });
    expect(captureBailException).toHaveBeenCalledWith(expect.any(Error), {
      bailSubreason: 'unrecognizedStoryEntry',
      bailPath: 'buildManifest',
    });
    expect(Sentry.setContext).toHaveBeenCalledWith('turboSnapUnrecognizedStoryEntry', {
      entries: ['./future-cache/storybook-stories.js'],
    });
    expect(determineChangedFiles).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(storyless, '/repo/packages/ui/.chromatic');
  });

  it('preserves the no-story bail when writing its diagnostic manifest fails', async () => {
    const storyless = { ...manifest, storyFileHashes: new Map() };
    const error = new Error('disk is read-only');
    vi.mocked(buildManifest).mockResolvedValue(storyless as any);
    vi.mocked(writeManifest).mockImplementation(() => {
      throw error;
    });

    await expect(traceChangedFiles(input)).resolves.toEqual({
      status: 'bailed',
      turboSnap: { bailReason: { noStoryFiles: true } },
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { turbo_snap_v2_diagnostic: 'writeManifest' },
    });
  });
});
