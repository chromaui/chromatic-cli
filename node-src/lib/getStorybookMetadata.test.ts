import { describe, expect, it, vi } from 'vitest';

import { findStaticDirectories } from './getStorybookMetadata';

const makeConfig = (returnValue: any) => ({
  getSafeFieldValue: vi.fn().mockReturnValue(returnValue),
});

describe('findStaticDirs', () => {
  it('returns string entries resolved relative to configDirectory', () => {
    const config = makeConfig(['./static', '../public']);
    expect(findStaticDirectories(config, true, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('extracts `from` from object entries and resolves relative to configDirectory', () => {
    const config = makeConfig([
      { from: './static', to: '/' },
      { from: '../public', to: '/public' },
    ]);
    expect(findStaticDirectories(config, true, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('handles mixed string and object entries', () => {
    const config = makeConfig(['./static', { from: '../public', to: '/' }]);
    expect(findStaticDirectories(config, true, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('leaves absolute paths unchanged', () => {
    const config = makeConfig(['/absolute/path']);
    expect(findStaticDirectories(config, true, '.storybook')).toEqual({
      staticDir: ['/absolute/path'],
    });
  });

  it('uses nested configDirectory when provided', () => {
    const config = makeConfig(['./static']);
    expect(findStaticDirectories(config, true, 'packages/ui/.storybook')).toEqual({
      staticDir: ['packages/ui/.storybook/static'],
    });
  });

  it('returns {} for empty array', () => {
    const config = makeConfig([]);
    expect(findStaticDirectories(config, true)).toEqual({});
  });

  it('returns {} when v7 is false', () => {
    const config = makeConfig(['./static']);
    expect(findStaticDirectories(config, false)).toEqual({});
  });

  it('returns {} when mainConfig is null', () => {
    expect(findStaticDirectories(null, true)).toEqual({});
  });

  it('returns {} when staticDirs is not present on config', () => {
    const config = makeConfig(undefined);
    expect(findStaticDirectories(config, true)).toEqual({});
  });

  it('returns {} when staticDirs is a non-array value', () => {
    const config = makeConfig('./static');
    expect(findStaticDirectories(config, true)).toEqual({});
  });

  it('returns {} when all entries have no valid path', () => {
    const config = makeConfig([null, undefined, { to: '/' }]);
    expect(findStaticDirectories(config, true)).toEqual({});
  });
});
