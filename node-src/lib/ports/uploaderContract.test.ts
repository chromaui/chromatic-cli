import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Uploader, UploadFileTarget } from './uploader';
import { createHttpUploader } from './uploaderHttpAdapter';
import { createInMemoryUploader, InMemoryUploaderState } from './uploaderInMemoryAdapter';

vi.mock('../fileReaderBlob', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  FileReaderBlob: class {
    constructor(_path: string, length: number, onProgress: (delta: number) => void) {
      onProgress(length / 2);
      onProgress(length / 2);
    }
  },
}));

interface AdapterSetup {
  adapter: Uploader;
  uploadedTargets: () => UploadFileTarget[];
  primeSentinelReady: (url: string) => void;
}

function httpSetup(): AdapterSetup {
  const http = {
    fetch: vi.fn().mockResolvedValue({ ok: true, text: async () => 'OK' }),
  } as any;
  const adapter = createHttpUploader({
    getHttp: () => http,
    log: { debug: vi.fn(), getLevel: () => 'info' } as any,
  });
  return {
    adapter,
    uploadedTargets: () => [],
    primeSentinelReady: () => {
      // http adapter reads the sentinel URL itself; fetch mock returns 'OK' by default.
    },
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryUploaderState = { sentinelReady: new Set() };
  const adapter = createInMemoryUploader(state);
  return {
    adapter,
    uploadedTargets: () => state.uploadedTargets ?? [],
    primeSentinelReady: (url) => {
      state.sentinelReady?.add(url);
    },
  };
}

const adapters = [
  ['http', httpSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('Uploader (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a file, reporting progress for the full length', async () => {
    const { adapter } = makeSetup();
    const target: UploadFileTarget = {
      contentType: 'text/plain',
      fileKey: 'k',
      filePath: 'a.txt',
      formAction: 'https://s3.example.com/upload',
      formFields: {},
      contentLength: 100,
      localPath: '/tmp/a.txt',
    };
    let total = 0;
    await adapter.uploadFile(target, {
      onProgress: (delta) => {
        total += delta;
      },
      retries: 0,
    });
    expect(total).toBe(100);
  });

  it('resolves when the sentinel is ready', async () => {
    const { adapter, primeSentinelReady } = makeSetup();
    primeSentinelReady('https://sentinel.example.com/ok');
    await expect(
      adapter.waitForSentinel({ name: 'ok', url: 'https://sentinel.example.com/ok' })
    ).resolves.toBeUndefined();
  });
});
