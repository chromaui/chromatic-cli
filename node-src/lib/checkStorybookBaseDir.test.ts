import { describe, expect, it } from 'vitest';
import { checkStorybookBaseDir } from './checkStorybookBaseDir';
import path from 'path';
import TestLogger from './testLogger';

const getContext: any = (storybookBaseDir?: string) => ({
  log: new TestLogger(),
  options: { storybookBaseDir },
});

describe('checkStorybookBaseDir', () => {
  it('should return if a js(x)/ts(x) module in stats exists at the path prepended by the storybookBaseDir', () => {
    const ctx = getContext(path.join(__dirname, '../__mocks__/storybookBaseDir'));
    const statsWithJsModule = {
      modules: [
        {
          id: './subdir/test.js',
          name: './subdir/test.js',
        },
      ],
    };
    const statsWithJsxModule = {
      modules: [
        {
          id: './subdir/test.jsx',
          name: './subdir/test.jsx',
        },
      ],
    };
    const statsWithTsModule = {
      modules: [
        {
          id: './test.ts',
          name: './test.ts',
        },
      ],
    };
    const statsWithTsxModule = {
      modules: [
        {
          id: './test.tsx',
          name: './test.tsx',
        },
      ],
    };

    [statsWithJsModule, statsWithJsxModule, statsWithTsModule, statsWithTsxModule].forEach(
      (stats) => {
        expect(() => checkStorybookBaseDir(ctx, stats)).not.toThrow();
      }
    );
  });

  it('should throw an error if none of the js(x)/ts(x) modules in stats exist at the path prepended by the storybookBaseDir', () => {
    const ctxWithBaseDir = getContext(path.join(__dirname, '../__mocks__/wrong'));
    const ctxWithoutBaseDir = getContext();
    const stats = {
      modules: [
        {
          id: './subdir/test.js',
          name: './subdir/test.js',
        },
      ],
    };

    expect(() => checkStorybookBaseDir(ctxWithBaseDir, stats)).toThrow();
    expect(() => checkStorybookBaseDir(ctxWithoutBaseDir, stats)).toThrow();
  });

  it('should not consider modules in node_modules as valid files to match', () => {
    const ctx = getContext(path.join(__dirname, '../../'));
    const stats = {
      modules: [
        {
          id: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js',
          name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js',
        },
      ],
    };

    expect(() => checkStorybookBaseDir(ctx, stats)).toThrow();
  });
});
