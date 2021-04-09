import { createReadStream, readJson, readdirSync, readFileSync, statSync } from 'fs-extra';
import fetch from 'node-fetch';
import progress from 'progress-stream';

import { getDependentStoryFiles } from '../lib/getDependentStoryFiles';
import { validateFiles, traceChangedFiles, uploadStorybook } from './upload';

jest.mock('fs-extra');
jest.mock('node-fetch');
jest.mock('progress-stream');
jest.mock('../lib/getDependentStoryFiles');

const env = { CHROMATIC_RETRIES: 2 };
const log = { warn: jest.fn(), debug: jest.fn() };

describe('validateFiles', () => {
  it('sets fileInfo on context', async () => {
    readdirSync.mockReturnValue(['iframe.html', 'index.html']);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 });

    const ctx = { env, log, sourceDir: '/static/' };
    await validateFiles(ctx, {});

    expect(ctx.fileInfo).toEqual(
      expect.objectContaining({
        lengths: [
          { contentLength: 42, knownAs: 'iframe.html', pathname: 'iframe.html' },
          { contentLength: 42, knownAs: 'index.html', pathname: 'index.html' },
        ],
        paths: ['iframe.html', 'index.html'],
        total: 84,
      })
    );
  });

  it("throws when index.html doesn't exist", async () => {
    readdirSync.mockReturnValue(['iframe.html']);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 });

    const ctx = { env, log, sourceDir: '/static/' };
    await expect(validateFiles(ctx, {})).rejects.toThrow('Invalid Storybook build at /static/');
  });

  it("throws when iframe.html doesn't exist", async () => {
    readdirSync.mockReturnValue(['index.html']);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 });

    const ctx = { env, log, sourceDir: '/static/' };
    await expect(validateFiles(ctx, {})).rejects.toThrow('Invalid Storybook build at /static/');
  });

  describe('with buildLogFile', () => {
    it('retries using outputDir from build-storybook.log', async () => {
      readdirSync.mockReturnValueOnce([]);
      readdirSync.mockReturnValueOnce(['iframe.html', 'index.html']);
      statSync.mockReturnValue({ isDirectory: () => false, size: 42 });
      readFileSync.mockReturnValue('info => Output directory: /var/storybook-static');

      const ctx = {
        env,
        log,
        sourceDir: '/static/',
        buildLogFile: 'build-storybook.log',
        options: {},
        packageJson: {},
      };
      await validateFiles(ctx, {});

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected build directory'));
      expect(ctx.sourceDir).toBe('/var/storybook-static');
      expect(ctx.fileInfo).toEqual(
        expect.objectContaining({
          lengths: [
            { contentLength: 42, knownAs: 'iframe.html', pathname: 'iframe.html' },
            { contentLength: 42, knownAs: 'index.html', pathname: 'index.html' },
          ],
          paths: ['iframe.html', 'index.html'],
          total: 84,
        })
      );
    });
  });
});

describe('traceChangedFiles', () => {
  it('sets onlyStoryFiles on context', async () => {
    const deps = { 123: './example.stories.js' };
    getDependentStoryFiles.mockReturnValueOnce(deps);

    const ctx = {
      env,
      log,
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
    };
    await traceChangedFiles(ctx, {});

    expect(ctx.onlyStoryFiles).toEqual(deps);
  });

  it("skips build when there's zero affected story files", async () => {
    getDependentStoryFiles.mockReturnValueOnce({});
    readJson.mockReturnValue({});

    const ctx = {
      env,
      log,
      client: { runQuery: jest.fn().mockReturnValue({}) },
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { commit: '516dd7d', changedFiles: ['./example.js'] },
    };
    await traceChangedFiles(ctx, {});

    expect(getDependentStoryFiles).toHaveBeenCalledWith(expect.any(Object), {}, ['./example.js']);
    expect(ctx.client.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('TesterSkipBuildMutation'),
      { commit: '516dd7d' }
    );
    expect(ctx.onlyStoryFiles).toEqual({});
    expect(ctx.skip).toBe(true);
  });
});

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
    fetch.mockReturnValue({ ok: true });
    progress.mockReturnValue({ on: jest.fn() });

    const fileInfo = {
      lengths: [
        { knownAs: 'iframe.html', contentLength: 42 },
        { knownAs: 'index.html', contentLength: 42 },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const ctx = { client, env, log, sourceDir: '/static/', options: {}, fileInfo };
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
