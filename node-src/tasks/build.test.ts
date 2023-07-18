import execaDefault from 'execa';
import mockfs from 'mock-fs';

import { buildStorybook, setSourceDir, setSpawnParams } from './build';

jest.mock('execa');

const execa = <jest.MockedFunction<typeof execaDefault>>execaDefault;
const execaCommand = <jest.MockedFunction<typeof execaDefault.command>>execaDefault.command;

afterEach(() => {
  mockfs.restore();
});

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { options: {}, storybook: { version: '5.0.0' } } as any;
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { options: {}, storybook: { version: '4.0.0' } } as any;
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '5.0.0' } } as any;
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '4.0.0' } } as any;
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});

describe('setSpawnParams', () => {
  const npmExecPath = process.env.npm_execpath;

  beforeEach(() => {
    process.env.npm_execpath = npmExecPath;
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
    execaCommand.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
  });

  it('sets the spawn params on the context', async () => {
    mockfs({ './package.json': JSON.stringify({ packageManager: 'npm' }) });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setSpawnParams(ctx);

    expect(ctx.spawnParams).toEqual({
      client: 'npm',
      clientVersion: '1.2.3',
      nodeVersion: '1.2.3',
      platform: expect.stringMatching(/darwin|linux|win32/),
      command:
        'npm run build:storybook -- --output-dir ./source-dir/ --webpack-stats-json ./source-dir/',
    });
  });

  it('supports yarn', async () => {
    mockfs({ './package.json': JSON.stringify({ packageManager: 'yarn' }) });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setSpawnParams(ctx);

    expect(ctx.spawnParams).toEqual({
      client: 'yarn',
      clientVersion: '1.2.3',
      nodeVersion: '1.2.3',
      platform: expect.stringMatching(/darwin|linux|win32/),
      command: 'yarn run build:storybook --output-dir ./source-dir/',
    });
  });

  it('supports pnpm', async () => {
    mockfs({ './package.json': JSON.stringify({ packageManager: 'pnpm' }) });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setSpawnParams(ctx);

    expect(ctx.spawnParams).toEqual({
      client: 'pnpm',
      clientVersion: '1.2.3',
      nodeVersion: '1.2.3',
      platform: expect.stringMatching(/darwin|linux|win32/),
      command: 'pnpm run build:storybook --output-dir ./source-dir/',
    });
  });

  it('warns if --only-changes is not supported', async () => {
    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: { changedFiles: ['./index.js'] },
      log: { warn: jest.fn() },
    } as any;
    await setSpawnParams(ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      spawnParams: { command: 'npm run build:storybook --script-args' },
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: { debug: jest.fn() },
    } as any;
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    expect(execaCommand).toHaveBeenCalledWith(
      'npm run build:storybook --script-args',
      expect.objectContaining({ stdio: expect.any(Array) })
    );
    expect(ctx.log.debug).toHaveBeenCalledWith(
      'Using spawnParams:',
      JSON.stringify(ctx.spawnParams, null, 2)
    );
  });

  it('fails when build times out', async () => {
    const ctx = {
      spawnParams: { command: 'npm run build:storybook --script-args' },
      options: { buildScriptName: '' },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: jest.fn(), error: jest.fn() },
    } as any;
    execaCommand.mockReturnValue(new Promise((resolve) => setTimeout(resolve, 100)) as any);
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));
  });
});
