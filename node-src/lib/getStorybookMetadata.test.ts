import { describe, expect, it, vi } from 'vitest';

import {
  findStaticDirectories,
  getStorybookMetadata,
  MainConfigReader,
} from './getStorybookMetadata';

// The two config forms are read by `readMainConfig`, so these only need a reader answering
// `staticDirs`; the forms themselves are covered by the fixture-based tests below.
function makeConfig(returnValue: any, isAstConfig = true): MainConfigReader {
  return { readField: vi.fn().mockReturnValue(returnValue), isAstConfig };
}

describe('findStaticDirs', () => {
  it('returns string entries resolved relative to configDirectory', () => {
    const config = makeConfig(['./static', '../public']);
    expect(findStaticDirectories(config, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('extracts `from` from object entries and resolves relative to configDirectory', () => {
    const config = makeConfig([
      { from: './static', to: '/' },
      { from: '../public', to: '/public' },
    ]);
    expect(findStaticDirectories(config, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('handles mixed string and object entries', () => {
    const config = makeConfig(['./static', { from: '../public', to: '/' }]);
    expect(findStaticDirectories(config, '.storybook')).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('leaves absolute paths unchanged', () => {
    const config = makeConfig(['/absolute/path']);
    expect(findStaticDirectories(config, '.storybook')).toEqual({
      staticDir: ['/absolute/path'],
    });
  });

  it('uses nested configDirectory when provided', () => {
    const config = makeConfig(['./static']);
    expect(findStaticDirectories(config, 'packages/ui/.storybook')).toEqual({
      staticDir: ['packages/ui/.storybook/static'],
    });
  });

  it('returns {} for empty array', () => {
    const config = makeConfig([]);
    expect(findStaticDirectories(config)).toEqual({});
  });

  it('returns {} when the main config could not be read', () => {
    expect(findStaticDirectories(undefined)).toEqual({});
  });

  it('returns {} when the main config was evaluated rather than parsed', () => {
    const config = makeConfig(['./static'], false);
    expect(findStaticDirectories(config)).toEqual({});
  });

  it('returns {} when staticDirs is not present on config', () => {
    const config = makeConfig(undefined);
    expect(findStaticDirectories(config)).toEqual({});
  });

  it('returns {} when staticDirs is a non-array value', () => {
    const config = makeConfig('./static');
    expect(findStaticDirectories(config)).toEqual({});
  });

  it('returns {} when all entries have no valid path', () => {
    const config = makeConfig([null, undefined, { to: '/' }]);
    expect(findStaticDirectories(config)).toEqual({});
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
  // `require()` only auto-appends `.js`, so every other extension falls through to the AST parser.
  it.each([
    { project: 'ts-esm', file: 'main.ts', format: 'esm' },
    { project: 'mjs-esm', file: 'main.mjs', format: 'esm' },
    { project: 'cjs', file: 'main.cjs', format: 'cjs' },
  ])('resolves staticDirs from parsed $file ($format)', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.staticDir).toEqual([
      `${FIXTURES}/${project}/.storybook/static`,
      `${FIXTURES}/${project}/public`,
    ]);
  });

  // staticDirs decides TurboSnap v1's static-file bails, so evaluated configs stay out of it until
  // that widening is made deliberately.
  it.each([
    { project: 'js-esm', format: 'esm' },
    { project: 'js-cjs', format: 'cjs' },
  ])('leaves staticDirs unset for an evaluated main.js ($format)', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.staticDir).toBeUndefined();
  });
});

describe('getStorybookMetadata builder discovery', () => {
  it('detects the builder from an evaluated ESM config module', async () => {
    const metadata = await getStorybookMetadata(getDeps('builder-js-esm'));

    expect(metadata.builder?.name).toBe('@storybook/react-vite');
  });
});
