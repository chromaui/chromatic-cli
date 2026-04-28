import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/upload';
import { runUpload } from './upload';

vi.mock('../run/phases/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/upload')>();
  return { ...actual, runUploadPhase: vi.fn() };
});

const runUploadPhase = vi.mocked(phaseModule.runUploadPhase);

afterEach(() => {
  vi.clearAllMocks();
});

const fakeTask = { title: '', output: '' } as any;

function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    options: {},
    env: {},
    sourceDir: '/static',
    fileInfo: {
      paths: ['iframe.html'],
      statsPath: '',
      lengths: [{ pathname: 'iframe.html', knownAs: 'iframe.html', contentLength: 42 }],
      total: 42,
    },
    announcedBuild: { id: 'b' },
    ports: { ui: { taskUpdate: vi.fn() } },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('runUpload', () => {
  it('mirrors the UploadedState slice onto context', async () => {
    runUploadPhase.mockResolvedValueOnce({
      uploadedBytes: 100,
      uploadedFiles: 2,
      sentinelUrls: ['https://s/sentinel'],
    });
    const ctx = makeContext();
    await runUpload(ctx, fakeTask);
    expect(ctx.uploadedBytes).toBe(100);
    expect(ctx.uploadedFiles).toBe(2);
    expect(ctx.sentinelUrls).toEqual(['https://s/sentinel']);
  });

  it('skips when ctx.skip is set', async () => {
    const ctx = makeContext({ skip: true });
    await runUpload(ctx, fakeTask);
    expect(runUploadPhase).not.toHaveBeenCalled();
  });

  it('forwards onProgress to ports.ui.taskUpdate', async () => {
    runUploadPhase.mockImplementationOnce(async ({ onProgress }) => {
      onProgress?.({ progress: 21, total: 42, output: 'uploading 50%' });
      return { uploadedBytes: 42, uploadedFiles: 1, sentinelUrls: [] };
    });
    const ctx = makeContext();
    await runUpload(ctx, fakeTask);
    expect(ctx.ports.ui.taskUpdate).toHaveBeenCalledWith({ output: 'uploading 50%' });
  });
});
