import { describe, expect, it } from 'vitest';

import { isMainConfigFile, isPreviewConfig } from './storybookConfigFiles';

describe('isMainConfigFile', () => {
  it.each(['config/sb/main.ts', 'config/sb/main.mjs', 'config/sb/main.cts'])(
    'recognizes %s in the configured directory',
    (filePath) => {
      expect(isMainConfigFile(filePath, 'config/sb')).toBe(true);
    }
  );

  it.each(['config/sb/manager.ts', 'config/sb/preview.ts', 'config/sb/mocks/main.ts'])(
    'rejects %s',
    (filePath) => {
      expect(isMainConfigFile(filePath, 'config/sb')).toBe(false);
    }
  );

  it('only matches the configured directory, not the default one', () => {
    expect(isMainConfigFile('.storybook/main.ts', 'config/sb')).toBe(false);
  });

  it('matches absolute paths', () => {
    expect(isMainConfigFile('/repo/.storybook/main.ts', '/repo/.storybook')).toBe(true);
  });
});

describe('isPreviewConfig', () => {
  it.each(['config/sb/preview.tsx', 'config/sb/preview.js'])(
    'recognizes %s in the configured directory',
    (filePath) => {
      expect(isPreviewConfig(filePath, 'config/sb')).toBe(true);
    }
  );

  it.each([
    'config/sb/preview.json',
    'config/sb/preview.ts.bak',
    'config/sb/preview-head.html',
    'config/sb/mocks/preview.ts',
  ])('rejects %s', (filePath) => {
    expect(isPreviewConfig(filePath, 'config/sb')).toBe(false);
  });

  it('matches canonical manifest paths', () => {
    expect(isPreviewConfig('./.storybook/preview.ts', './.storybook')).toBe(true);
  });
});
