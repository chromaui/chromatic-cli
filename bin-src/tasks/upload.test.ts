import * as fs from 'fs-extra';
import progressStream from 'progress-stream';

import * as trimStatsFile from '../trim-stats-file';
import { getDependentStoryFiles as dependentStoryFiles } from '../lib/getDependentStoryFiles';
import { validateFiles, traceChangedFiles, uploadStorybook } from './upload';

jest.mock('fs-extra');
jest.mock('progress-stream');
jest.mock('../lib/getDependentStoryFiles');

const getDependentStoryFiles = <jest.MockedFunction<typeof dependentStoryFiles>>dependentStoryFiles;
const createReadStream = <jest.MockedFunction<typeof fs.createReadStream>>fs.createReadStream;
const readdirSync = <jest.MockedFunction<typeof fs.readdirSync>>fs.readdirSync;
const readFileSync = <jest.MockedFunction<typeof fs.readFileSync>>fs.readFileSync;
const statSync = <jest.MockedFunction<typeof fs.statSync>>fs.statSync;
const progress = <jest.MockedFunction<typeof progressStream>>progressStream;

const env = { CHROMATIC_RETRIES: 2 };
const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
const http = { fetch: jest.fn() };

describe('validateFiles', () => {
  it('sets fileInfo on context', async () => {
    readdirSync.mockReturnValue(['iframe.html', 'index.html'] as any);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await validateFiles(ctx);

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
    readdirSync.mockReturnValue(['iframe.html'] as any);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  it("throws when iframe.html doesn't exist", async () => {
    readdirSync.mockReturnValue(['index.html'] as any);
    statSync.mockReturnValue({ isDirectory: () => false, size: 42 } as any);

    const ctx = { env, log, http, sourceDir: '/static/' } as any;
    await expect(validateFiles(ctx)).rejects.toThrow('Invalid Storybook build at /static/');
  });

  describe('with buildLogFile', () => {
    it('retries using outputDir from build-storybook.log', async () => {
      readdirSync.mockReturnValueOnce([]);
      readdirSync.mockReturnValueOnce(['iframe.html', 'index.html'] as any);
      statSync.mockReturnValue({ isDirectory: () => false, size: 42 } as any);
      readFileSync.mockReturnValue('info => Output directory: /var/storybook-static');

      const ctx = {
        env,
        log,
        http,
        sourceDir: '/static/',
        buildLogFile: 'build-storybook.log',
        options: {},
        packageJson: {},
      } as any;
      await validateFiles(ctx);

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
  jest.spyOn(trimStatsFile, 'readStatsFile').mockReturnValueOnce(Promise.resolve(undefined));

  it('sets onlyStoryFiles on context', async () => {
    const deps = { 123: ['./example.stories.js'] };
    getDependentStoryFiles.mockResolvedValueOnce(deps);

    const ctx = {
      env,
      log,
      http,
      options: {},
      sourceDir: '/static/',
      fileInfo: { statsPath: '/static/preview-stats.json' },
      git: { changedFiles: ['./example.js'] },
    } as any;
    await traceChangedFiles(ctx, {} as any);

    expect(ctx.onlyStoryFiles).toStrictEqual(deps);
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

    createReadStream.mockReturnValue({ pipe: jest.fn() } as any);
    http.fetch.mockReturnValue({ ok: true });
    progress.mockReturnValue({ on: jest.fn() } as any);

    const fileInfo = {
      lengths: [
        { knownAs: 'iframe.html', contentLength: 42 },
        { knownAs: 'index.html', contentLength: 42 },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const ctx = { client, env, log, http, sourceDir: '/static/', options: {}, fileInfo } as any;
    await uploadStorybook(ctx, {} as any);

    expect(client.runQuery).toHaveBeenCalledWith(expect.stringMatching(/GetUploadUrlsMutation/), {
      paths: ['iframe.html', 'index.html'],
    });
    expect(http.fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/iframe.html',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'content-length': '42',
          'cache-control': 'max-age=31536000',
        },
      }),
      expect.objectContaining({ retries: 0 })
    );
    expect(http.fetch).toHaveBeenCalledWith(
      'https://asdqwe.chromatic.com/index.html',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'content-type': 'text/html',
          'content-length': '42',
          'cache-control': 'max-age=31536000',
        },
      }),
      expect.objectContaining({ retries: 0 })
    );
    expect(ctx.uploadedBytes).toBe(84);
    expect(ctx.isolatorUrl).toBe('https://asdqwe.chromatic.com/iframe.html');
  });
});
