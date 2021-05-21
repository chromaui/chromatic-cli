import execa from 'execa';

import { buildStorybook, setSourceDir, setSpawnParams } from './build';

jest.mock('execa');

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { options: {}, storybook: { version: '5.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { options: {}, storybook: { version: '4.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '5.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '4.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});

describe('setSpawnParams', () => {
  const npmExecPath = process.env.npm_execpath;

  beforeEach(() => {
    process.env.npm_execpath = npmExecPath;
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }));
  });

  it('sets the spawn params on the context', async () => {
    process.env.npm_execpath = 'npm';
    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    };
    await setSpawnParams(ctx);
    expect(ctx.spawnParams).toEqual({
      client: 'npm',
      clientVersion: '1.2.3',
      nodeVersion: '1.2.3',
      platform: expect.stringMatching(/darwin|linux|win32/),
      command: 'npm',
      clientArgs: ['run', '--silent'],
      scriptArgs: [
        'build:storybook',
        '--',
        '--output-dir',
        './source-dir/',
        '--webpack-stats-json',
        './source-dir/',
      ],
    });
  });

  it('supports yarn', async () => {
    process.env.npm_execpath = '/path/to/yarn.js';
    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    };
    await setSpawnParams(ctx);
    expect(ctx.spawnParams).toEqual({
      client: 'yarn',
      clientVersion: '1.2.3',
      nodeVersion: '1.2.3',
      platform: expect.stringMatching(/darwin|linux|win32/),
      command: expect.stringMatching(/node/),
      clientArgs: ['/path/to/yarn.js', 'run'],
      scriptArgs: ['build:storybook', '--output-dir', './source-dir/'],
    });
  });

  it('warns if --only-changes is not supported', async () => {
    process.env.npm_execpath = 'npm';
    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: { changedFiles: ['./index.js'] },
      log: { warn: jest.fn() },
    };
    await setSpawnParams(ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      spawnParams: {
        command: 'build:storybook',
        clientArgs: ['--client-args'],
        scriptArgs: ['--script-args'],
      },
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: { debug: jest.fn() },
    };
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    expect(execa).toHaveBeenCalledWith(
      'build:storybook',
      ['--client-args', '--script-args'],
      expect.objectContaining({ stdio: expect.any(Array) })
    );
    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Using spawnParams:',
      JSON.stringify(ctx.spawnParams, null, 2)
    );
  });

  it('fails when build times out', async () => {
    const ctx = {
      spawnParams: {
        command: 'build:storybook',
        clientArgs: ['--client-args'],
        scriptArgs: ['--script-args'],
      },
      options: { buildScriptName: '' },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: jest.fn(), error: jest.fn() },
    };
    execa.mockReturnValue(new Promise((resolve) => setTimeout(resolve, 10)));
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));
  });
});
