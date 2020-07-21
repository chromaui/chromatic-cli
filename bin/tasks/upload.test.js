import { createReadStream, readdirSync, statSync } from 'fs';
import fetch from 'node-fetch';
import progress from 'progress-stream';

import { uploadStorybook } from './upload';

jest.mock('fs');
jest.mock('node-fetch');
jest.mock('progress-stream');

const env = { CHROMATIC_RETRIES: 2 };
const log = { debug: jest.fn() };

describe('uploadStorybook', () => {
  it('retrieves the upload locations, puts the files there and sets the isolatorUrl on context', async () => {
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({
      getUploadUrls: {
        domain: 'https://asdqwe.chromatic.com',
        urls: [
          {
            path: 'iframe.html',
            url: 'https://asdqwe.chromatic.com/iframe.html',
            contentType: 'text/html',
          },
          {
            path: 'index.html',
            url: 'https://asdqwe.chromatic.com/index.html',
            contentType: 'text/html',
          },
        ],
      },
    });

    createReadStream.mockReturnValue({ pipe: jest.fn() });
    readdirSync.mockReturnValue(['iframe.html', 'index.html']);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 });
    fetch.mockReturnValue({ ok: true });
    progress.mockReturnValue({ on: jest.fn() });

    const ctx = { client, env, log, sourceDir: '/static/', options: {} };
    await uploadStorybook(ctx, {});

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/TesterGetUploadUrlsMutation/),
      { paths: ['iframe.html', 'index.html'] }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/iframe.html',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'content-length': 42,
          'cache-control': 'max-age=31536000',
        },
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/index.html',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'content-length': 42,
          'cache-control': 'max-age=31536000',
        },
      })
    );
    expect(ctx.uploadedBytes).toBe(84);
    expect(ctx.isolatorUrl).toBe('https://asdqwe.chromatic.com/iframe.html');
  });
});
