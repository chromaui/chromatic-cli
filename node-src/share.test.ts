import { execa as execaDefault } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmShare, reserveShare } from './lib/share';
import { uploadFiles } from './lib/uploadFiles';
import { share } from './share';

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('./lib/share', () => ({
  confirmShare: vi.fn(async () => ({ status: 'received', daysToExpire: 7 })),
  reserveShare: vi.fn(async () => ({
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
    // Return a fake stream so neither the file logger nor the Storybook build log writes a real
    // file during tests.
    createWriteStream: vi.fn(() => ({
      on: (event: string, callback: () => void) => {
        if (event === 'open') callback();
      },
      write: vi.fn(),
      end: vi.fn(),
      cork: vi.fn(),
      uncork: vi.fn(),
    })),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => ['iframe.html', 'index.html']),
    statSync: vi.fn((path: string) => {
      if (path.endsWith('package.json')) return originalModule.statSync(path);
      return { isDirectory: () => false, size: 42 };
    }),
    existsSync: vi.fn(() => true),
  };
});

const execa = vi.mocked(execaDefault);
const upload = vi.mocked(uploadFiles);
const mockReserveShare = vi.mocked(reserveShare);
const mockConfirmShare = vi.mocked(confirmShare);

beforeEach(() => {
  vi.stubEnv('DISABLE_LOGGING', 'true');
  execa.mockResolvedValue({ all: '1.2.3' } as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('share()', () => {
  it('resolves with shareUrl after upload completes', async () => {
    const result = await share({ userToken: 'user-token' });

    expect(result.shareUrl).toBe('https://share.chromatic.com/test-share-id');
    expect(mockReserveShare).toHaveBeenCalled();
  });

  it('resolves with daysToExpire from confirmShare', async () => {
    const result = await share({ userToken: 'user-token' });

    expect(result.daysToExpire).toBe(7);
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
    mockReserveShare.mockRejectedValueOnce(new Error('Reserve failed'));

    await expect(share({ userToken: 'user-token' })).rejects.toThrow('Reserve failed');
  });

  it('calls onError and resolves when uploadShare fails', async () => {
    const onError = vi.fn();
    mockReserveShare.mockRejectedValueOnce(new Error('Reserve failed'));

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

  it('calls reserveShare with ctx containing the user token', async () => {
    await share({ userToken: 'my-user-token' });

    expect(mockReserveShare).toHaveBeenCalledWith(
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
    mockReserveShare.mockRejectedValueOnce(new Error('Reserve failed'));

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

  describe('log file', () => {
    it('does not configure a log file by default', async () => {
      await share({ userToken: 'user-token' });

      expect(mockReserveShare).toHaveBeenCalledWith(
        expect.objectContaining({ options: expect.objectContaining({ logFile: undefined }) })
      );
    });

    it('uses the log file path provided by the caller', async () => {
      await share({ userToken: 'user-token', logFile: 'custom.log' });

      expect(mockReserveShare).toHaveBeenCalledWith(
        expect.objectContaining({ options: expect.objectContaining({ logFile: 'custom.log' }) })
      );
    });
  });
});
