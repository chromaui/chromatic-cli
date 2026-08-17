import { describe, expect, it, vi } from 'vitest';

import {
  findStaticDirectories,
  getStorybookMetadata,
  MainConfigReader,
} from './getStorybookMetadata';

// The two config forms are read by `readMainConfig`, so these only need a reader answering
// `staticDirs`; the forms themselves are covered by the fixture-based tests below.
function makeConfig(returnValue: any): MainConfigReader {
  return { readField: vi.fn().mockReturnValue(returnValue), isAstConfig: true };
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
  // `main.ts` is the only extension `require()` misses that the shared pattern still parses.
  it('resolves staticDirs from a parsed main.ts', async () => {
    const metadata = await getStorybookMetadata(getDeps('ts-esm'));

    expect(metadata.staticDir).toEqual([
      `${FIXTURES}/ts-esm/.storybook/static`,
      `${FIXTURES}/ts-esm/public`,
    ]);
  });

  // `main.js` is in the shared pattern, so a `main.js` that `require()` cannot evaluate is parsed
  // too. This fixture's missing import makes that failure happen on every supported Node.
  it('resolves staticDirs from a main.js that require() cannot evaluate', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-esm-unrequirable'));

    expect(metadata.staticDir).toEqual([
      `${FIXTURES}/js-esm-unrequirable/.storybook/static`,
      `${FIXTURES}/js-esm-unrequirable/public`,
    ]);
  });

  // staticDirs decides TurboSnap v1's static-file bails, so neither evaluated configs nor the
  // extensions only TurboSnap v2 parses widen it. See the `astConfig` local in
  // `getStorybookMetadata` and SHARED_MAIN_CONFIG_PATTERN.
  it.each([
    { project: 'js-cjs', file: 'main.js', reason: 'evaluated cjs' },
    { project: 'mjs-esm', file: 'main.mjs', reason: 'not parsed by the shared pattern' },
    { project: 'cjs', file: 'main.cjs', reason: 'not parsed by the shared pattern' },
  ])('leaves staticDirs unset for $file ($reason)', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.staticDir).toBeUndefined();
  });
});

// Everything `getStorybookMetadata` returns lands on `ctx.storybook`, which TurboSnap v1 reads:
// `staticDir` is the entire basis of its static-file bails and `builder` reaches the announce
// payload. This pins the exact field set each config shape produces, so a change made for
// TurboSnap v2 cannot widen v1's inputs unnoticed. A new field in any row is a deliberate decision
// about v1, not a test to update in passing.
describe('getStorybookMetadata fields visible to TurboSnap v1', () => {
  it.each([
    { project: 'ts-esm', shape: 'a parsed main.ts', fields: ['staticDir', 'version'] },
    { project: 'mjs-esm', shape: 'an unreadable main.mjs', fields: ['builder', 'version'] },
    { project: 'cjs', shape: 'an unreadable main.cjs', fields: ['builder', 'version'] },
    { project: 'js-cjs', shape: 'an evaluated cjs main.js', fields: ['version'] },
    {
      project: 'js-esm-unrequirable',
      shape: 'a parsed main.js',
      fields: ['staticDir', 'version'],
    },
    {
      project: 'builder-js-esm',
      shape: 'a main.js declaring a framework',
      fields: ['builder', 'version'],
    },
  ])('exposes exactly $fields for $shape', async ({ project, fields }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(Object.keys(metadata).sort()).toEqual(fields);
  });

  // An ESM `main.js` is evaluated where `require(esm)` is available (unflagged from Node 22.12) and
  // AST-parsed where it is not, and this package supports Node >=22.0. Both outcomes are pinned
  // exactly by the `js-cjs` and `js-esm-unrequirable` rows above, so all this row can honestly claim
  // is that the runtime produces one of them.
  it('exposes one of the two pinned shapes for an esm main.js', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-esm'));

    expect([['version'], ['staticDir', 'version']]).toContainEqual(Object.keys(metadata).sort());
  });

  // The sentinel is what v1 sees when no config could be read; a real name here means the config
  // was parsed after all.
  it.each([
    { project: 'mjs-esm', shape: 'main.mjs', builderName: 'unknown' },
    { project: 'cjs', shape: 'main.cjs', builderName: 'unknown' },
    { project: 'builder-js-esm', shape: 'main.js', builderName: '@storybook/react-vite' },
  ])('reports the $builderName builder for $shape', async ({ project, builderName }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.builder?.name).toBe(builderName);
  });
});
