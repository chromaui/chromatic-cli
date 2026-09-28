import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../../tasks/readStatsFile';
import TestLogger from '../testLogger';
import { traceChangedFiles } from '.';
import { traceChangedFiles as traceChangedFilesV1 } from './v1';
import { traceChangedFiles as traceChangedFilesV2 } from './v2';
import { realProjectFiles } from './v2/projectFiles';

const { scopeSetTag, scopeSetContext } = vi.hoisted(() => ({
  scopeSetTag: vi.fn(),
  scopeSetContext: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  withScope: vi.fn(async (callback) =>
    callback({ setTag: scopeSetTag, setContext: scopeSetContext })
  ),
}));

vi.mock('../../tasks/readStatsFile', () => ({
  readStatsFile: vi.fn(),
}));

vi.mock('./v1', () => ({
  traceChangedFiles: vi.fn(),
}));

vi.mock('./v2', () => ({
  traceChangedFiles: vi.fn(),
}));

const projectFiles = { kind: 'real-project-files' };

vi.mock('./v2/projectFiles', () => ({
  realProjectFiles: vi.fn(),
}));

const stats = { modules: [] };
const v1Result = {
  status: 'traced' as const,
  onlyStoryFiles: { button: ['./src/Button.stories.tsx'] },
  turboSnap: {},
  untracedFiles: [],
};

function makeContext() {
  return {
    log: new TestLogger(),
    turboSnap: {},
    options: {},
    env: {},
    git: { changedFiles: ['./src/Button.tsx'] },
    fileInfo: { statsPath: '/repo/packages/ui/storybook-static/preview-stats.json' },
    client: { runQuery: vi.fn() },
    announcedBuild: { id: 'head-build' },
    sourceDir: '/repo/packages/ui/storybook-static',
    storybook: {
      projectRoot: '/repo/packages/ui',
      configDir: '/repo/packages/ui/.storybook',
      staticDirs: ['/repo/packages/ui/public'],
    },
  } as any;
}

beforeEach(() => {
  vi.mocked(realProjectFiles).mockReturnValue(projectFiles as any);
  vi.mocked(readStatsFile).mockResolvedValue(stats);
  vi.mocked(traceChangedFilesV2).mockResolvedValue({ status: 'fallback' });
  vi.mocked(traceChangedFilesV1).mockResolvedValue(v1Result);
});

describe('traceChangedFiles', () => {
  it('collects hashes but skips v1 when TurboSnap is unavailable', async () => {
    const ctx = { ...makeContext(), turboSnap: { unavailable: true } };

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(traceChangedFilesV2).toHaveBeenCalledOnce();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('stays silent for a prebuilt Storybook when TurboSnap is not requested', async () => {
    const ctx = { ...makeContext(), turboSnap: undefined, fileInfo: undefined };

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });

    expect(readStatsFile).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it.each(['noAncestorBuild', 'rebuild', 'invalidChangedFiles', 'changedExternalFiles'])(
    'collects hashes for v2 even when v1 recorded the bail reason %s',
    async (bailReason) => {
      const ctx = { ...makeContext(), turboSnap: { [bailReason]: true } };

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledOnce();
    }
  );

  it('does not collect hashes when the off switch is set', async () => {
    const ctx = { ...makeContext(), env: { CHROMATIC_TURBOSNAP_DISABLE_HASHES: true } };

    await traceChangedFiles(ctx);

    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).toHaveBeenCalledOnce();
  });

  it('returns skipped and only runs TurboSnap v2 when changed files are unknown', async () => {
    const ctx = { ...makeContext(), git: { changedFiles: undefined } };

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual({ status: 'skipped' });

    expect(readStatsFile).toHaveBeenCalled();
    expect(traceChangedFilesV2).toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  // An empty list means nothing changed, so v1 must run and trace zero story files. Skipping here
  // would leave `onlyStoryFiles` unset and capture every story instead of copying them all.
  it('runs TurboSnap v1 when the changed files list is empty', async () => {
    const ctx = { ...makeContext(), git: { changedFiles: [] } };

    await expect(traceChangedFiles(ctx)).resolves.toStrictEqual(v1Result);

    expect(traceChangedFilesV2).toHaveBeenCalled();
    expect(traceChangedFilesV1).toHaveBeenCalledOnce();
  });

  it('throws if the stats file is not found and the user asked for TurboSnap', async () => {
    const ctx = { ...makeContext(), fileInfo: undefined };

    await expect(traceChangedFiles(ctx)).rejects.toThrow('TurboSnap requires a stats file');

    expect(readStatsFile).not.toHaveBeenCalled();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('keeps an unreadable stats file terminal for both generations', async () => {
    const ctx = makeContext();
    const error = new Error('stats file is unreadable');
    vi.mocked(readStatsFile).mockRejectedValue(error);

    await expect(traceChangedFiles(ctx)).rejects.toBe(error);

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(traceChangedFilesV2).not.toHaveBeenCalled();
    expect(traceChangedFilesV1).not.toHaveBeenCalled();
  });

  it('reads the stats once and gives the same graph and Storybook paths to both generations', async () => {
    const ctx = makeContext();

    await traceChangedFiles(ctx);

    expect(readStatsFile).toHaveBeenCalledOnce();
    expect(readStatsFile).toHaveBeenCalledWith(ctx.fileInfo.statsPath);
    expect(traceChangedFilesV2).toHaveBeenCalledWith({
      log: ctx.log,
      failureLogLevel: 'error',
      graphqlClient: ctx.client,
      buildId: 'head-build',
      stats,
      manifestPath: '/repo/packages/ui/storybook-static/.chromatic/turbosnap-manifest.json',
      projectRoot: ctx.storybook.projectRoot,
      configDir: ctx.storybook.configDir,
      staticDirs: ctx.storybook.staticDirs,
      projectFiles,
    });
    expect(traceChangedFilesV1).toHaveBeenCalledWith(ctx, stats, ctx.fileInfo.statsPath);
  });

  it('runs v2 before v1 and returns only the v1 result', async () => {
    const ctx = makeContext();

    await expect(traceChangedFiles(ctx)).resolves.toBe(v1Result);

    expect(vi.mocked(traceChangedFilesV2).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(traceChangedFilesV1).mock.invocationCallOrder[0]
    );
  });

  // An error that escaped v2's own handling takes the same level as one it handled, so a user who
  // never asked for TurboSnap is not shown a failure of an optimisation they never heard of.
  it.each([
    ['error', {}],
    ['debug', undefined],
  ])(
    'reports an unexpected v2 rejection at %s and still returns the v1 result',
    async (level, turboSnap) => {
      const ctx = { ...makeContext(), turboSnap };
      const error = new Error('v2 escaped its own error handling');
      vi.mocked(traceChangedFilesV2).mockRejectedValue(error);

      await expect(traceChangedFiles(ctx)).resolves.toEqual(
        turboSnap ? v1Result : { status: 'skipped' }
      );

      expect(ctx.log[level]).toHaveBeenCalledWith(expect.any(String), error);
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    }
  );

  it('does not report an exception when v2 succeeds', async () => {
    await traceChangedFiles(makeContext());

    expect(traceChangedFilesV2).toHaveBeenCalledOnce();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('tags the v2 run so its Sentry events can be isolated', async () => {
    await traceChangedFiles(makeContext());

    expect(Sentry.withScope).toHaveBeenCalledOnce();
    expect(scopeSetTag).toHaveBeenCalledWith('turbosnap', 'v2');
  });

  // A v2 failure report has to say where the run looked for Storybook and whether the build was
  // prebuilt, or we're flying blind trying to fix the bug.
  it.each([
    ['/repo/packages/ui/storybook-static', 'true'],
    [undefined, 'false'],
  ])('records where the run looked when storybookBuildDir is %s', async (buildDirectory, tag) => {
    const ctx = makeContext();
    ctx.options.storybookBuildDir = buildDirectory;

    await traceChangedFiles(ctx);

    expect(scopeSetTag).toHaveBeenCalledWith('storybook_build_dir', tag);
    expect(scopeSetContext).toHaveBeenCalledWith('turbosnap_v2', {
      cwd: process.cwd(),
      projectRoot: '/repo/packages/ui',
      configDir: '/repo/packages/ui/.storybook',
      storybookBuildDir: buildDirectory,
    });
  });

  // The user sees a failure of the feature they asked for; they never see a failure of an
  // optimisation for a build they have not heard of.
  it.each([
    ['error', {}, 'true'],
    ['debug', undefined, 'false'],
  ])(
    'gives v2 the %s log level and tags the run when turboSnap is %o',
    async (failureLogLevel, turboSnap, tag) => {
      const ctx = { ...makeContext(), turboSnap };

      await traceChangedFiles(ctx);

      expect(traceChangedFilesV2).toHaveBeenCalledWith(
        expect.objectContaining({ failureLogLevel })
      );
      expect(scopeSetTag).toHaveBeenCalledWith('turbosnap_requested', tag);
    }
  );
});
