import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setRuntimeMetadata } from './setRuntimeMetadata';

vi.mock('@antfu/ni');
vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

const execa = vi.mocked(execaDefault);
const getCliCommand = vi.mocked(getCliCommandDefault);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setRuntimeMetadata', () => {
  beforeEach(() => {
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
  });

  it('sets the build command on the context', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.2.0' },
      git: { changedFiles: ['./index.js'] },
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'npm',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'yarn',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm'));

    const ctx = {
      sourceDir: './source-dir/',
      options: { buildScriptName: 'build:storybook' },
      storybook: { version: '6.1.0' },
      git: {},
    } as any;
    await setRuntimeMetadata(ctx);

    expect(ctx.runtimeMetadata).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'pnpm',
      packageManagerVersion: '1.2.3',
    });
  });
});
