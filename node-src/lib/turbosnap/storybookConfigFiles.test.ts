import { describe, expect, it } from 'vitest';

import { storybookConfigFileKind } from './storybookConfigFiles';

describe('storybookConfigFileKind', () => {
  it.each([
    ['config/sb/main.ts', 'mainConfig'],
    ['config/sb/main.mjs', 'mainConfig'],
    ['config/sb/main.cts', 'mainConfig'],
    ['config/sb/preview.tsx', 'previewConfig'],
    ['config/sb/preview.js', 'previewConfig'],
    ['config/sb/preview-head.html', 'previewHead'],
    ['config/sb/preview-body.html', 'previewBody'],
  ])('recognizes %s in the configured directory', (filePath, kind) => {
    expect(storybookConfigFileKind(filePath, 'config/sb')).toBe(kind);
  });

  it.each([
    'config/sb/manager.ts',
    'config/sb/manager-head.html',
    'config/sb/vitest.setup.ts',
    'config/sb/mocks.json',
    'config/sb/preview.json',
    'config/sb/preview.ts.bak',
    'config/sb/mocks/preview.ts',
    'config/sb/mocks/main.ts',
  ])('leaves %s off the allowlist', (filePath) => {
    expect(storybookConfigFileKind(filePath, 'config/sb')).toBeUndefined();
  });

  it('only matches the configured directory, not the default one', () => {
    expect(storybookConfigFileKind('.storybook/preview.ts', 'config/sb')).toBeUndefined();
  });

  it('matches absolute and canonical manifest paths alike', () => {
    expect(storybookConfigFileKind('/repo/.storybook/main.ts', '/repo/.storybook')).toBe(
      'mainConfig'
    );
    expect(storybookConfigFileKind('./.storybook/preview.ts', './.storybook')).toBe(
      'previewConfig'
    );
  });
});
