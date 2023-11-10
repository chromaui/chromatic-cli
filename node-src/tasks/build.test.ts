import { execaCommand } from 'execa';
import mockfs from 'mock-fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildStorybook, setSourceDir, setBuildCommand } from './build';

vi.mock('execa');

const command = vi.mocked(execaCommand);

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

describe('setBuildCommand', () => {
  it('sets the build command on the context', async () => {
    mockfs({ './package.json': JSON.stringify({ packageManager: 'npm' }) });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(ctx.buildCommand).toEqual(
      'npm run build:storybook -- --output-dir ./source-dir/ --webpack-stats-json ./source-dir/'
    );
  });

  it('supports yarn', async () => {
    mockfs({
      './package.json': JSON.stringify({ packageManager: 'yarn' }),
      './yarn.lock': '',
    });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setBuildCommand(ctx);

    expect(ctx.buildCommand).toEqual('yarn run build:storybook --output-dir ./source-dir/');
  });

  it('supports pnpm', async () => {
    mockfs({
      './package.json': JSON.stringify({ packageManager: 'pnpm' }),
      './pnpm-lock.yaml': '',
    });

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setBuildCommand(ctx);

    expect(ctx.buildCommand).toEqual('pnpm run build:storybook --output-dir ./source-dir/');
  });

  it('warns if --only-changes is not supported', async () => {
    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: { changedFiles: ['./index.js'] },
      log: { warn: vi.fn() },
    } as any;
    await setBuildCommand(ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: { debug: vi.fn() },
      options: {},
    } as any;
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    expect(command).toHaveBeenCalledWith(
      'npm run build:storybook --script-args',
      expect.objectContaining({ stdio: expect.any(Array) })
    );
    expect(ctx.log.debug).toHaveBeenCalledWith('Running build command:', ctx.buildCommand);
  });

  it('fails when build times out', async () => {
    const ctx = {
      buildCommand: 'npm run build:storybook --script-args',
      options: { buildScriptName: '' },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: vi.fn(), error: vi.fn() },
    } as any;
    command.mockReturnValue(new Promise((resolve) => setTimeout(resolve, 100)) as any);
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));
  });
});
