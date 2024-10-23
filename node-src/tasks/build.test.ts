import { beforeEach } from 'node:test';

import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import { execaCommand } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import { buildStorybook, setBuildCommand, setSourceDirectory } from './build';

vi.mock('execa');
vi.mock('@antfu/ni');

const command = vi.mocked(execaCommand);
const getCliCommand = vi.mocked(getCliCommandDefault);

beforeEach(() => {
  command.mockClear();
});

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { options: {}, storybook: { version: '5.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { options: {}, storybook: { version: '4.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '5.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '4.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});

describe('setBuildCommand', () => {
  it('sets the build command on the context', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      flags: {},
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('yarn run build:storybook');
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('pnpm run build:storybook');
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
      options: { storybookLogFile: 'build-storybook.log' },
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

  it('passes NODE_ENV=production', async () => {
    const ctx = {
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000 },
      log: { debug: vi.fn() },
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    expect(command).toHaveBeenCalledWith(
      ctx.buildCommand,
      expect.objectContaining({ env: { CI: '1', NODE_ENV: 'production' } })
    );
  });

  it('allows overriding NODE_ENV with STORYBOOK_NODE_ENV', async () => {
    const ctx = {
      buildCommand: 'npm run build:storybook --script-args',
      env: { STORYBOOK_BUILD_TIMEOUT: 1000, STORYBOOK_NODE_ENV: 'test' },
      log: { debug: vi.fn() },
      options: { storybookLogFile: 'build-storybook.log' },
    } as any;
    await buildStorybook(ctx);
    expect(command).toHaveBeenCalledWith(
      ctx.buildCommand,
      expect.objectContaining({ env: { CI: '1', NODE_ENV: 'test' } })
    );
  });
});

describe('buildStorybook E2E', () => {
  // Error messages that we expect to result in the missing dependency error
  const missingDependencyErrorMessages = [
    { name: 'not found 1', error: 'Command not found: build-archive-storybook' },
    { name: 'not found 2', error: 'Command "build-archive-storybook" not found' },
    { name: 'npm not found', error: 'NPM error code E404\n\nMore error info' },
    {
      name: 'exit code not found',
      error: 'Command failed with exit code 127: some command\n\nsome error line\n\n',
    },
    {
      name: 'single line command failure',
      error:
        'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe',
    },
  ];

  it.each(missingDependencyErrorMessages)(
    'fails with missing dependency error when error message is $name',
    async ({ error }) => {
      const ctx = {
        buildCommand: 'npm exec build-archive-storybook',
        options: { buildScriptName: '', playwright: true },
        env: { STORYBOOK_BUILD_TIMEOUT: 0 },
        log: { debug: vi.fn(), error: vi.fn() },
      } as any;

      command.mockRejectedValueOnce(new Error(error));
      await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
      expect(ctx.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import `@chromatic-com/playwright`')
      );

      ctx.log.error.mockClear();
    }
  );

  it('fails with generic error message when not missing dependency error', async () => {
    const ctx = {
      buildCommand: 'npm exec build-archive-storybook',
      options: { buildScriptName: '', playwright: true },
      env: { STORYBOOK_BUILD_TIMEOUT: 0 },
      log: { debug: vi.fn(), error: vi.fn() },
    } as any;

    const errorMessage =
      'Command failed with exit code 1: npm exec build-archive-storybook --output-dir /tmp/chromatic--4210-0cyodqfYZabe\n\nMore error message lines\n\nAnd more';
    command.mockRejectedValueOnce(new Error(errorMessage));
    await expect(buildStorybook(ctx)).rejects.toThrow('Command failed');
    expect(ctx.log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to import `@chromatic-com/playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to run `chromatic --playwright`')
    );
    expect(ctx.log.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });
});
