import { describe, expect, it } from 'vitest';
import checkStorybookBaseDir from './checkStorybookBaseDir';
import path from 'path';

describe('checkStorybookBaseDir', () => {
  it('should return if a js module in stats exists at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../../');
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './README.md' },
        { name: './test-stories/A.js' },
      ],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).not.toThrow();
  });

  it('should return if a jsx module in stats exists at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../__mocks__/storybookBaseDir');
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './index.html' },
        { name: './subdir/test.jsx' },
      ],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).not.toThrow();
  });

  it('should return if a ts module in stats exists at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../__mocks__/storybookBaseDir');
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './index.html' },
        { name: './subdir/test.ts' },
      ],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).not.toThrow();
  });

  it('should return if a tsx module in stats exists at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../__mocks__/storybookBaseDir');
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './index.html' },
        { name: './test.tsx' },
      ],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).not.toThrow();
  });

  it('should throw an "invalid" error if none of the modules in stats exist at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../../');
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './index.html' },
      ],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).toThrow(/Invalid/);
  });

  it('should throw a "missing" error if none of the modules in stats exist at the path prepended by the storybookBaseDir', () => {
    const stats = {
      modules: [
        { name: './node_modules/@storybook/core-client/dist/esm/globals/polyfills.js' },
        { name: './index.html' },
        { name: './subdir/test.jsx' },
      ],
    };

    expect(() => checkStorybookBaseDir(undefined, stats)).toThrow(/Missing/);
  });
});
