import { getCliCommand as getCliCommandDefault } from '@antfu/ni';
import TestLogger from '@cli/testLogger';
import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeMetadata } from './getRuntimeMetadata';

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
const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRuntimeMetadata', () => {
  beforeEach(() => {
    execa.mockReturnValue(Promise.resolve({ stdout: '1.2.3' }) as any);
  });

  it('supports npm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('npm'));

    const result = await getRuntimeMetadata({ log });

    expect(result).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'npm',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports yarn', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('yarn'));

    const result = await getRuntimeMetadata({ log });

    expect(result).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'yarn',
      packageManagerVersion: '1.2.3',
    });
  });

  it('supports pnpm', async () => {
    getCliCommand.mockReturnValue(Promise.resolve('pnpm'));

    const result = await getRuntimeMetadata({ log });

    expect(result).toEqual({
      nodePlatform: expect.stringMatching(/darwin|linux|win32/),
      nodeVersion: process.versions.node,
      packageManager: 'pnpm',
      packageManagerVersion: '1.2.3',
    });
  });
});
