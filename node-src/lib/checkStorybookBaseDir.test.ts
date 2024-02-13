import { describe, expect, it } from 'vitest';
import checkStorybookBaseDir from './checkStorybookBaseDir';
import path from 'path';

describe('checkStorybookBaseDir', () => {
  it('should return if the file in the first preview-status module exists at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../__mocks__');
    const stats = {
      modules: [{ name: './index.html' }],
    };

    const result = checkStorybookBaseDir(storybookBaseDir, stats);

    expect(result).toBe(true);
  });

  it('should throw an error if the file in the first preview-stats module does not exist at the path prepended by the storybookBaseDir', () => {
    const storybookBaseDir = path.join(__dirname, '../__mocks__/wrong');
    const stats = {
      modules: [{ name: './index.html' }],
    };

    expect(() => checkStorybookBaseDir(storybookBaseDir, stats)).toThrow();
  });
});
