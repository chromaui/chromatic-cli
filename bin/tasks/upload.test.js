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
            path: 'one.js',
            url: 'https://asdqwe.chromatic.com/one.js',
            contentType: 'text/javascript',
          },
          {
            path: 'two.js',
            url: 'https://asdqwe.chromatic.com/two.js',
            contentType: 'text/javascript',
          },
        ],
      },
    });

    createReadStream.mockReturnValue({ pipe: jest.fn() });
    readdirSync.mockReturnValue(['one.js', 'two.js']);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 });
    fetch.mockReturnValue({ ok: true });
    progress.mockReturnValue({ on: jest.fn() });

    const ctx = { client, env, log, sourceDir: '/static/', options: {} };
    await uploadStorybook(ctx, {});

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/TesterGetUploadUrlsMutation/),
      { paths: ['one.js', 'two.js'] }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/one.js',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/javascript',
          'content-length': 42,
          'cache-control': 'max-age=31536000',
        },
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/two.js',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/javascript',
          'content-length': 42,
          'cache-control': 'max-age=31536000',
        },
      })
    );
    expect(ctx.uploadedBytes).toBe(84);
    expect(ctx.isolatorUrl).toBe('https://asdqwe.chromatic.com/iframe.html');
  });
});
