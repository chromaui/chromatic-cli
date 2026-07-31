import { describe, expect, it, vi } from 'vitest';

import { findStaticDirectories, getStorybookMetadata } from './getStorybookMetadata';

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

  it('reads staticDirs off an evaluated CommonJS config module', () => {
    expect(findStaticDirectories({ staticDirs: ['./static'] }, false)).toEqual({
      staticDir: ['.storybook/static'],
    });
  });

  it('reads staticDirs off the default export of an evaluated ESM config module', () => {
    expect(findStaticDirectories({ default: { staticDirs: ['./static'] } }, false)).toEqual({
      staticDir: ['.storybook/static'],
    });
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

// Each fixture is a real project directory, because whether `require()` of the config succeeds
// depends on the file's extension and the nearest package.json `type`.
const FIXTURES = 'node-src/__mocks__/storybookMainConfig';

function getDeps(project: string) {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    options: { storybookConfigDir: `${FIXTURES}/${project}/.storybook` },
    // Pinned so the viewlayer lookup can't reach into this repo's own node_modules.
    env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/react@8.0.0' },
    packageJson: {},
  } as any;
}

describe('getStorybookMetadata staticDirs discovery', () => {
  it.each([
    { project: 'ts-esm', file: 'main.ts', format: 'esm' },
    { project: 'js-esm', file: 'main.js', format: 'esm' },
    { project: 'js-cjs', file: 'main.js', format: 'cjs' },
    { project: 'mjs-esm', file: 'main.mjs', format: 'esm' },
    { project: 'cjs', file: 'main.cjs', format: 'cjs' },
  ])('resolves staticDirs from $file ($format)', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.staticDir).toEqual([
      `${FIXTURES}/${project}/.storybook/static`,
      `${FIXTURES}/${project}/public`,
    ]);
  });
});

describe('getStorybookMetadata builder discovery', () => {
  it('detects the builder from an evaluated ESM config module', async () => {
    const metadata = await getStorybookMetadata(getDeps('builder-js-esm'));

    expect(metadata.builder?.name).toBe('@storybook/react-vite');
  });
});
