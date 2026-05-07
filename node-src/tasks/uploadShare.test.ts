import { describe, expect, it, vi } from 'vitest';

import { uploadShareFiles } from './uploadShare';

vi.mock('../lib/uploadFiles');

import { uploadFiles } from '../lib/uploadFiles';

const uploadFilesMock = vi.mocked(uploadFiles);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };

const shareTarget = {
  formAction: 'https://s3.amazonaws.com/presigned',
  formFields: { bucket: 'chromatic-builds', 'X-Amz-Signature': 'sig' },
  keyPrefix: 'shares/user-123-upload-456',
};

describe('uploadShareFiles', () => {
  it('uploads index.html in a separate phase after all other files', async () => {
    uploadFilesMock.mockResolvedValue(undefined);

    const ctx = {
      share: { shareUrl: 'https://chromatic.com/share/abc', target: shareTarget },
      env: environment,
      options: {},
      sourceDir: '/static/',
      fileInfo: {
        paths: ['iframe.html', 'main.js', 'index.html'],
        lengths: [
          { knownAs: 'iframe.html', contentLength: 42 },
          { knownAs: 'main.js', contentLength: 100 },
          { knownAs: 'index.html', contentLength: 42 },
        ],
        total: 184,
      },
    } as any;

    await uploadShareFiles(ctx, {} as any);

    expect(uploadFilesMock).toHaveBeenCalledTimes(2);

    // First call: non-index files
    const firstCallTargets = uploadFilesMock.mock.calls[0][1];
    expect(firstCallTargets.map((t) => t.filePath)).toEqual(
      expect.arrayContaining(['iframe.html', 'main.js'])
    );
    expect(firstCallTargets.map((t) => t.filePath)).not.toContain('index.html');

    // Second call: index.html only
    const secondCallTargets = uploadFilesMock.mock.calls[1][1];
    expect(secondCallTargets).toHaveLength(1);
    expect(secondCallTargets[0].filePath).toBe('index.html');
  });

  it('uses the shared formAction and sets per-file key in formFields', async () => {
    uploadFilesMock.mockResolvedValue(undefined);

    const ctx = {
      share: { shareUrl: 'https://chromatic.com/share/abc', target: shareTarget },
      env: environment,
      options: {},
      sourceDir: '/static/',
      fileInfo: {
        paths: ['main.js', 'index.html'],
        lengths: [
          { knownAs: 'main.js', contentLength: 100 },
          { knownAs: 'index.html', contentLength: 42 },
        ],
        total: 142,
      },
    } as any;

    await uploadShareFiles(ctx, {} as any);

    const allTargets = uploadFilesMock.mock.calls.flatMap(([, targets]) => targets);
    for (const t of allTargets) {
      expect(t.formAction).toBe(shareTarget.formAction);
      expect(t.formFields.key).toBe(`${shareTarget.keyPrefix}/${t.filePath}`);
    }
  });

  it('rejects if a file upload fails', async () => {
    uploadFilesMock.mockRejectedValue(new Error('Upload failed'));

    const ctx = {
      share: { shareUrl: 'https://chromatic.com/share/abc', target: shareTarget },
      env: environment,
      options: {},
      sourceDir: '/static/',
      fileInfo: {
        paths: ['iframe.html', 'index.html'],
        lengths: [
          { knownAs: 'iframe.html', contentLength: 42 },
          { knownAs: 'index.html', contentLength: 42 },
        ],
        total: 84,
      },
    } as any;

    await expect(uploadShareFiles(ctx, {} as any)).rejects.toThrow('Upload failed');
  });
});
