import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyPrepareOutput, prepareProject } from '.';
import { calculateFileHashes } from './calculateFileHashes';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

vi.mock('./calculateFileHashes');
vi.mock('./traceChangedFiles');
vi.mock('./validateAndroidArtifact');
vi.mock('./validateFiles');

beforeEach(() => {
  vi.mocked(validateAndroidArtifact).mockResolvedValue(undefined);
  vi.mocked(calculateFileHashes).mockResolvedValue({});
});

describe('prepareProject', () => {
  it('gives TurboSnap a corrected source directory before tracing', async () => {
    const fileInfo = {
      lengths: [],
      paths: [],
      statsPath: '/repo/actual-storybook/preview-stats.json',
      total: 0,
    };
    vi.mocked(validateFiles).mockResolvedValue({
      fileInfo,
      sourceDir: '/repo/actual-storybook',
    });
    vi.mocked(traceChangedFiles).mockResolvedValue({ turboSnapOutcome: { mechanism: 'none' } });

    await prepareProject({} as any, {
      isReactNativeApp: false,
      sourceDir: '/repo/configured-storybook',
      announcedBuild: { id: 'build-id', browsers: ['chrome'] },
      git: {} as any,
      storybook: {} as any,
    });

    expect(traceChangedFiles).toHaveBeenCalledOnce();
    expect(traceChangedFiles).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        sourceDir: '/repo/actual-storybook',
        statsPath: '/repo/actual-storybook/preview-stats.json',
      })
    );
  });
});

describe('applyPrepareOutput', () => {
  const fileInfo = { lengths: [], paths: [], statsPath: '', total: 0 };

  it('writes the TurboSnap results onto the context', () => {
    const ctx = { git: {} } as any;

    applyPrepareOutput(ctx, {
      fileInfo,
      sourceDir: '/storybook-static',
      turboSnapOutcome: { mechanism: 'v1', bailed: false },
      turboSnap: { rootPath: '/repo' },
      onlyStoryFiles: ['./Button.stories.tsx'],
      untracedFiles: [{ filepath: 'README.md', glob: '*.md' }],
      changedDependencyNames: ['react'],
    });

    expect(ctx).toMatchObject({
      sourceDir: '/storybook-static',
      turboSnapOutcome: { mechanism: 'v1', bailed: false },
      turboSnap: { rootPath: '/repo' },
      onlyStoryFiles: ['./Button.stories.tsx'],
      untracedFiles: [{ filepath: 'README.md', glob: '*.md' }],
      git: { changedDependencyNames: ['react'] },
    });
  });

  // gitInfo records why it bailed before prepare runs; a skipped trace must not erase that.
  it('keeps the bail gitInfo recorded when tracing was skipped', () => {
    const turboSnap = { bailReason: { rebuild: true as const } };
    const ctx = { git: {}, turboSnap } as any;

    applyPrepareOutput(ctx, {
      fileInfo,
      sourceDir: '/storybook-static',
      turboSnapOutcome: { mechanism: 'v1', bailed: true },
    });

    expect(ctx.turboSnap).toBe(turboSnap);
    expect(ctx.onlyStoryFiles).toBeUndefined();
  });
});
