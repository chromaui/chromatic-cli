import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { patchModulePath } from '../../lib/testUtilities';
import { setBuildCommand } from './setBuildCommand';

vi.mock('@antfu/ni');

const getCliCommand = vi.mocked(getCliCommandDefault);

const baseDeps = { options: {}, log: new TestLogger() } as any;
const baseInput = { flags: {} } as any;

beforeEach(() => {
  getCliCommand.mockClear();
});

describe('setBuildCommand', () => {
  it('returns the build command', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '6.2.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('npm run build:storybook');
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '6.2.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('yarn run build:storybook');
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '6.2.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('pnpm run build:storybook');
  });

  it('uses --build-command, if set', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildCommand: 'nx run my-app:build-storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '6.2.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).not.toHaveBeenCalled();
    expect(result).toEqual('nx run my-app:build-storybook --webpack-stats-json=./source-dir/');
  });

  it('warns if --only-changes is not supported', async () => {
    const log = new TestLogger();
    await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' }, log },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '6.1.0' },
        changedFiles: ['./index.js'],
      }
    );
    expect(log.warn).toHaveBeenCalledWith(
      'Storybook version 6.2.0 or later is required to use the --only-changed flag'
    );
  });

  it('uses the correct flag for webpack stats for < 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '8.4.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('npm run build:storybook');
  });

  it('uses the correct flag for webpack stats for >= 8.5.0', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      {
        ...baseInput,
        sourceDir: './source-dir/',
        storybook: { version: '8.5.0' },
        changedFiles: ['./index.js'],
      }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('npm run build:storybook');
  });

  it('uses the old flag when the storybook version is undetected', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm run build:storybook'));

    const result = await setBuildCommand(
      { ...baseDeps, options: { buildScriptName: 'build:storybook' } },
      { ...baseInput, sourceDir: './source-dir/', changedFiles: ['./index.js'] }
    );

    expect(getCliCommand).toHaveBeenCalledWith(
      expect.anything(),
      ['build:storybook', '--output-dir=./source-dir/', '--webpack-stats-json=./source-dir/'],
      { programmatic: true }
    );
    expect(result).toEqual('npm run build:storybook');
  });

  it.each(['playwright', 'cypress', 'vitest'])(
    'resolves to the E2E build command when using %s',
    async (e2ePackage) => {
      const revertPatch = patchModulePath(
        `@chromatic-com/${e2ePackage}/bin/build-archive-storybook`,
        `path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook`
      );
      onTestFinished(revertPatch);

      const result = await setBuildCommand(
        {
          ...baseDeps,
          options: { [e2ePackage]: true, buildScriptName: 'build:storybook', inAction: false },
        },
        { ...baseInput, sourceDir: './source-dir/' }
      );

      expect(result).toEqual(
        `node path/to/@chromatic-com/${e2ePackage}/bin/build-archive-storybook --output-dir=./source-dir/`
      );
    }
  );

  it('forwards E2E build arguments through npm exec when running in the action', async () => {
    getCliCommand.mockImplementation(async (runner, args) => runner('npm', args as string[]));

    const result = await setBuildCommand(
      { ...baseDeps, options: { playwright: true, inAction: true } },
      { ...baseInput, sourceDir: './source-dir/' }
    );

    expect(result).toEqual('npm exec -- build-archive-storybook --output-dir=./source-dir/');
  });
});
