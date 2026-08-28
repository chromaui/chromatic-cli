import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareProject } from '.';
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
    vi.mocked(traceChangedFiles).mockImplementation(async (_deps, { turboSnapContext }) => {
      expect(turboSnapContext.sourceDir).toBe('/repo/actual-storybook');
      expect(turboSnapContext.fileInfo).toBe(fileInfo);
      return {};
    });
    const turboSnapContext = {
      sourceDir: '/repo/configured-storybook',
    } as any;

    await prepareProject({} as any, {
      isReactNativeApp: false,
      sourceDir: '/repo/configured-storybook',
      turboSnapContext,
    });

    expect(traceChangedFiles).toHaveBeenCalledOnce();
  });
});
