import { Readable } from 'node:stream';

import { execa as execaDefault } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { share } from '.';
import { confirmShare, reserveShareOnAPI } from './lib/share';
import { uploadFiles } from './lib/uploadFiles';

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('node-fetch', () => ({
  default: vi.fn(async (_url, { body } = {} as any) => ({
    ok: true,
    json: async () => {
      let query = '';
      try {
        const data = JSON.parse(body);
        query = data.query;
      } catch {
        // Do nothing
      }

      if (query?.match('CreateAppTokenMutation')) {
        return { data: { appToken: 'app-token' } };
      }
      if (query?.match('CreateCLITokenMutation')) {
        return { data: { cliToken: 'cli-token' } };
      }

      throw new Error(query ? `Unknown query: ${query}` : `Unmocked request`);
    },
  })),
}));

vi.mock('./lib/share', () => ({
  confirmShare: vi.fn(async () => ({ status: 'received' })),
  reserveShareOnAPI: vi.fn(async () => ({
    shareId: 'test-share-id',
    shareUrl: 'https://share.chromatic.com/test-share-id',
    target: {
      formAction: 'https://s3.amazonaws.com',
      formFields: {},
      keyPrefix: 'shares/user-123-upload-456',
    },
  })),
}));

vi.mock('./lib/uploadFiles');

vi.mock('./lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

vi.mock('./lib/getPackageManager', () => ({
  getPackageManagerName: () => Promise.resolve('pnpm'),
  getPackageManagerRunCommand: (args: string[]) => Promise.resolve(`pnpm run ${args.join(' ')}`),
}));

vi.mock('fs', async (importOriginal) => {
  const originalModule = (await importOriginal()) as any;
  return {
    ...originalModule,
    pathExists: async () => true,
    mkdirSync: vi.fn(),
    readFileSync: originalModule.readFileSync,
    writeFileSync: vi.fn(),
    createReadStream: vi.fn(() => Readable.from([])),
    createWriteStream: originalModule.createWriteStream,
    readdirSync: vi.fn(() => ['iframe.html', 'index.html']),
    stat: originalModule.stat,
    statSync: vi.fn((path: string) => {
      const fsStatSync = originalModule.statSync;
      if (path.endsWith('package.json')) return fsStatSync(path);
      return { isDirectory: () => false, size: 42 };
    }),
    existsSync: vi.fn(() => true),
    access: vi.fn((_path: string, callback: (err: null) => void) =>
      Promise.resolve(callback(null))
    ),
  };
});

const execa = vi.mocked(execaDefault);
const upload = vi.mocked(uploadFiles);
const mockUploadShare = vi.mocked(reserveShareOnAPI);
const mockConfirmShare = vi.mocked(confirmShare);

let processEnvironment: NodeJS.ProcessEnv;

beforeEach(() => {
  processEnvironment = process.env;
  process.env = {
    DISABLE_LOGGING: 'true',
    CHROMATIC_PROJECT_TOKEN: undefined,
  };
  execa.mockReset();
  execa.mockResolvedValue({ all: '1.2.3' } as any);
});

afterEach(() => {
  process.env = processEnvironment;
  vi.clearAllMocks();
});

describe('share()', () => {
  it('resolves with shareUrl after upload completes', async () => {
    const result = await share({ userToken: 'user-token' });

    expect(result.shareUrl).toBe('https://share.chromatic.com/test-share-id');
    expect(mockUploadShare).toHaveBeenCalled();
  });

  it('calls onUrl as soon as the URL is reserved', async () => {
    const onUrl = vi.fn();

    // Make uploadFiles pend so we can verify onUrl fires before upload completes
    let resolveUpload: (() => void) | undefined;
    upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );

    const resultPromise = share({ userToken: 'user-token', onUrl });

    // Wait for the pipeline to reach the upload step
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());

    // onUrl should have been called before upload completes
    expect(onUrl).toHaveBeenCalledWith('https://share.chromatic.com/test-share-id');

    resolveUpload?.();
    await resultPromise;
  });

  it('calls onProgress with bytes uploaded and total', async () => {
    const onProgress = vi.fn();

    upload.mockImplementationOnce(async (_ctx, _targets, progressCallback) => {
      progressCallback?.(42);
    });

    await share({ userToken: 'user-token', onProgress });

    expect(onProgress).toHaveBeenCalledWith(42, expect.any(Number));
  });

  it('passes abortSignal through to the upload context', async () => {
    const controller = new AbortController();

    upload.mockImplementationOnce(async (ctx) => {
      expect(ctx.options.experimental_abortSignal).toBe(controller.signal);
    });

    await share({ userToken: 'user-token', abortSignal: controller.signal });
  });

  it('rejects when uploadShare fails and no onError provided', async () => {
    mockUploadShare.mockRejectedValueOnce(new Error('Reserve failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow('Reserve failed');
  });

  it('calls onError and resolves when uploadShare fails', async () => {
    const onError = vi.fn();
    mockUploadShare.mockRejectedValueOnce(new Error('Reserve failed'));

    const result = await share({ userToken: 'user-token', onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Reserve failed' }));
    expect(result.shareUrl).toBe('');
  });

  it('calls onError and resolves when upload fails', async () => {
    const onError = vi.fn();
    upload.mockRejectedValueOnce(new Error('S3 upload failed'));

    const result = await share({ userToken: 'user-token', onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'S3 upload failed' }));
    expect(result.shareUrl).toBe('https://share.chromatic.com/test-share-id');
  });

  it('rejects when upload fails and no onError provided', async () => {
    upload.mockRejectedValueOnce(new Error('S3 upload failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow();
  });

  it('calls uploadShare with ctx containing the user token', async () => {
    await share({ userToken: 'my-user-token' });

    expect(mockUploadShare).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ userToken: 'my-user-token' }),
      })
    );
  });

  it('confirms share with status "complete" on success', async () => {
    await share({ userToken: 'user-token' });

    expect(mockConfirmShare).toHaveBeenCalledWith(
      expect.objectContaining({ share: expect.objectContaining({ shareId: 'test-share-id' }) }),
      'complete'
    );
  });

  it('confirms share with status "error" when upload fails', async () => {
    upload.mockRejectedValueOnce(new Error('S3 upload failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow();

    expect(mockConfirmShare).toHaveBeenCalledWith(
      expect.objectContaining({ share: expect.objectContaining({ shareId: 'test-share-id' }) }),
      'error'
    );
  });

  it('confirms share with status "cancelled" when aborted mid-upload', async () => {
    const controller = new AbortController();
    upload.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('Aborted');
    });

    await expect(
      share({ userToken: 'user-token', abortSignal: controller.signal })
    ).rejects.toThrow();

    expect(mockConfirmShare).toHaveBeenCalledWith(
      expect.objectContaining({ share: expect.objectContaining({ shareId: 'test-share-id' }) }),
      'cancelled'
    );
  });

  it('does not call confirmShare when uploadShare fails', async () => {
    mockUploadShare.mockRejectedValueOnce(new Error('Reserve failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow('Reserve failed');

    expect(mockConfirmShare).not.toHaveBeenCalled();
  });

  it('swallows confirmShare errors and still resolves on success', async () => {
    mockConfirmShare.mockRejectedValueOnce(new Error('Confirm failed'));

    const result = await share({ userToken: 'user-token' });

    expect(result.shareUrl).toBe('https://share.chromatic.com/test-share-id');
  });

  it('swallows confirmShare errors and still surfaces the original upload error', async () => {
    upload.mockRejectedValueOnce(new Error('S3 upload failed'));
    mockConfirmShare.mockRejectedValueOnce(new Error('Confirm failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow('S3 upload failed');
  });
});
