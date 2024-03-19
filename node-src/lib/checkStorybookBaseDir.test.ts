import { describe, expect, it } from 'vitest';
import { checkStorybookBaseDir } from './checkStorybookBaseDir';
import path from 'path';
import TestLogger from './testLogger';
import { exitCodes } from './setExitCode';

const getContext: any = (storybookBaseDir?: string) => ({
  log: new TestLogger(),
  options: { storybookBaseDir },
});

describe('checkStorybookBaseDir', () => {
  it('should return if a js(x)/ts(x) module in stats exists at the path prepended by the storybookBaseDir', async () => {
    const ctx = getContext(path.join(__dirname, '../__mocks__/storybookBaseDir'));

    const statsWithJsModule = {
      modules: [
        {
          id: './subdir/test.js',
          name: './subdir/test.js',
        },
      ],
    };
    await expect(checkStorybookBaseDir(ctx, statsWithJsModule)).resolves.toBeUndefined();

    const statsWithJsxModule = {
      modules: [
        {
          id: './subdir/test.jsx',
          name: './subdir/test.jsx',
        },
      ],
    };
    await expect(checkStorybookBaseDir(ctx, statsWithJsxModule)).resolves.toBeUndefined();

    const statsWithTsModule = {
      modules: [
        {
          id: './test.ts',
          name: './test.ts',
        },
      ],
    };
    await expect(checkStorybookBaseDir(ctx, statsWithTsModule)).resolves.toBeUndefined();

    const statsWithTsxModule = {
      modules: [
        {
          id: './subdir/test.tsx',
          name: './subdir/test.tsx',
        },
      ],
    };
    await expect(checkStorybookBaseDir(ctx, statsWithTsxModule)).resolves.toBeUndefined();
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

    const ctxWithBaseDir = getContext(path.join(__dirname, '../__mocks__/wrong'));
    await expect(() => checkStorybookBaseDir(ctxWithBaseDir, stats)).rejects.toThrow();
    expect(ctxWithBaseDir.exitCode).toBe(exitCodes.INVALID_OPTIONS);

    const ctxWithoutBaseDir = getContext();
    await expect(() => checkStorybookBaseDir(ctxWithoutBaseDir, stats)).rejects.toThrow();
    expect(ctxWithoutBaseDir.exitCode).toBe(exitCodes.INVALID_OPTIONS);
  });

  it('should not consider modules in node_modules as valid files to match', async () => {
    const ctx = getContext(path.join(__dirname, '../../'));
    const stats = {
      modules: [
        {
          id: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js',
          name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js',
        },
      ],
    };

    await expect(() => checkStorybookBaseDir(ctx, stats)).rejects.toThrow();
  });
});
