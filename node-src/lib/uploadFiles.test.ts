import { describe, expect, it, vi } from 'vitest';

import TestLogger from './testLogger';
import { uploadFiles } from './uploadFiles';

describe('uploadFiles', () => {
  it('rejects with the failed file as the message and the upload error as the cause', async () => {
    const uploadError = new Error('socket hang up');
    const ctx = {
      log: new TestLogger(),
      http: { fetch: vi.fn().mockRejectedValue(uploadError) },
      env: { CHROMATIC_RETRIES: 0 },
      options: {},
    } as any;
    const target = {
      contentLength: 1,
      contentType: 'text/plain',
      fileKey: 'chromatic.log',
      filePath: 'chromatic.log',
      formAction: 'https://s3',
      formFields: {},
      localPath: 'package.json',
      targetPath: '.chromatic/chromatic.log',
    };

    await expect(uploadFiles(ctx, [target])).rejects.toMatchObject({
      message: 'package.json',
      cause: uploadError,
    });
  });
});
