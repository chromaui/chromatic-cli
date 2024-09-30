import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import { checkStorybookBaseDirectory } from './checkStorybookBaseDirectory';
import { exitCodes } from './setExitCode';
import TestLogger from './testLogger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('../git/git');

const getRepositoryRoot = vi.mocked(git.getRepositoryRoot);

beforeEach(() => {
  getRepositoryRoot.mockResolvedValue(path.join(__dirname, '../__mocks__'));
});
afterEach(() => {
  getRepositoryRoot.mockReset();
});

const getContext: any = (storybookBaseDirectory?: string) => ({
  log: new TestLogger(),
  options: { storybookBaseDir: storybookBaseDirectory },
});

describe('checkStorybookBaseDir', () => {
  it('should return if a js(x)/ts(x) module in stats exists at the path prepended by the storybookBaseDir', async () => {
    const ctx = getContext('storybookBaseDir');

    const statsWithJsModule = {
      modules: [
        {
          id: './subdir/test.js',
          name: './subdir/test.js',
        },
      ],
    };
    await expect(checkStorybookBaseDirectory(ctx, statsWithJsModule)).resolves.toBeUndefined();

    const statsWithJsxModule = {
      modules: [
        {
          id: './subdir/test.jsx',
          name: './subdir/test.jsx',
        },
      ],
    };
    await expect(checkStorybookBaseDirectory(ctx, statsWithJsxModule)).resolves.toBeUndefined();

    const statsWithTsModule = {
      modules: [
        {
          id: './test.ts',
          name: './test.ts',
        },
      ],
    };
    await expect(checkStorybookBaseDirectory(ctx, statsWithTsModule)).resolves.toBeUndefined();

    const statsWithTsxModule = {
      modules: [
        {
          id: './subdir/test.tsx',
          name: './subdir/test.tsx',
        },
      ],
    };
    await expect(checkStorybookBaseDirectory(ctx, statsWithTsxModule)).resolves.toBeUndefined();
  });

  it('should throw an error if none of the js(x)/ts(x) modules in stats exist at the path prepended by the storybookBaseDir', async () => {
    const stats = {
      modules: [
        {
          id: './subdir/test.js',
          name: './subdir/test.js',
        },
      ],
    };

    const ctxWithBaseDirectory = getContext('wrong');
    await expect(() => checkStorybookBaseDirectory(ctxWithBaseDirectory, stats)).rejects.toThrow();
    expect(ctxWithBaseDirectory.exitCode).toBe(exitCodes.INVALID_OPTIONS);

    const ctxWithoutBaseDirectory = getContext();
    await expect(() =>
      checkStorybookBaseDirectory(ctxWithoutBaseDirectory, stats)
    ).rejects.toThrow();
    expect(ctxWithoutBaseDirectory.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('should not consider modules in node_modules as valid files to match', async () => {
    const ctx = getContext('../..');
    const stats = {
      modules: [
        {
          id: './node_modules/env-ci/index.js',
          name: './node_modules/env-ci/index.js',
        },
      ],
    };

    await expect(() => checkStorybookBaseDirectory(ctx, stats)).rejects.toThrow();
  });

  it('should assume current working directory if no storybookBaseDir is specified', async () => {
    const ctx = getContext();
    const stats = {
      modules: [
        {
          id: './node-src/index.ts',
          name: './node-src/index.ts',
        },
      ],
    };

    getRepositoryRoot.mockResolvedValueOnce(process.cwd());
    await expect(checkStorybookBaseDirectory(ctx, stats)).resolves.toBeUndefined();

    getRepositoryRoot.mockResolvedValueOnce(path.resolve(process.cwd(), '..'));
    await expect(checkStorybookBaseDirectory(ctx, stats)).resolves.toBeUndefined();
  });
});
