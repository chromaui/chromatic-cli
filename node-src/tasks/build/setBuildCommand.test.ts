import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { patchModulePath } from '../../lib/testUtilities';
import { setBuildCommand } from './setBuildCommand';

vi.mock('@antfu/ni');

const getCliCommand = vi.mocked(getCliCommandDefault);

const baseContext = { options: {}, flags: {} } as any;

beforeEach(() => {
  getCliCommand.mockClear();
});

describe('setBuildCommand', () => {
  it('sets the build command on the context', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      ...baseContext,
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
      ...baseContext,
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
    expect(ctx.buildCommand).toEqual('yarn run build:storybook');
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm run build:storybook'));

    const ctx = {
      ...baseContext,
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
    expect(ctx.buildCommand).toEqual('pnpm run build:storybook');
  });

  it('uses --build-command, if set', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildCommand: 'nx run my-app:build-storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).not.toHaveBeenCalled();
    expect(ctx.buildCommand).toEqual(
      'nx run my-app:build-storybook --webpack-stats-json=./source-dir/'
    );
  });

  it('warns if --only-changes is not supported', async () => {
    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: { changedFiles: ['./index.js'] },
      log: new TestLogger(),
    } as any;
    await setBuildCommand(ctx);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });

  it('uses the correct flag for webpack stats for < 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '8.4.0' },
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

  it('uses the correct flag for webpack stats for >= 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '8.5.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setBuildCommand(ctx);

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(ctx.buildCommand).toEqual('npm run build:storybook');
  });

  it('uses the old flag when it storybook version is undetected', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
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

  it.each(['playwright', 'cypress', 'vitest'])(
    'resolves to the E2E build command when using %s',
    async (e2ePackage) => {
      const revertPatch = patchModulePath(
        `@chromatic-com/${e2ePackage}/bin/build-archive-storybook`,
        `path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook`
      );
      onTestFinished(revertPatch);

      const ctx = {
        ...baseContext,
        options: { [e2ePackage]: true, buildScriptName: 'build:storybook', inAction: false },
        sourceDir: './source-dir/',
        git: {},
        log: new TestLogger(),
      } as any;

      await setBuildCommand(ctx);
      expect(ctx.buildCommand).toEqual(
        `node path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook --output-dir=./source-dir/`
      );
    }
  );

  it('forwards E2E build arguments through npm exec when running in the action', async () => {
    getCliCommand.mockImplementation(async (runner, args) => runner('npm', args as string[]));

    const ctx = {
      ...baseContext,
      sourceDir: './source-dir/',
      options: { playwright: true, inAction: true },
      git: {},
      log: new TestLogger(),
    } as any;

    await setBuildCommand(ctx);

    expect(ctx.buildCommand).toEqual(
      'npm exec -- build-archive-storybook --output-dir=./source-dir/'
    );
  });
});
