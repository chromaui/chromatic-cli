import { describe, expect, it, vi } from 'vitest';

import {
  findStaticDirectories,
  getStorybookMetadata,
  MainConfigReader,
  readMainConfig,
} from './getStorybookMetadata';

function makeConfig(returnValue: any): MainConfigReader {
  return { readField: vi.fn().mockReturnValue(returnValue) };
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

describe('readMainConfig reader', () => {
  it('reads a top-level field off an evaluated module', async () => {
    const mainConfig = await readMainConfig(`${FIXTURES}/js-cjs/.storybook`, getDeps('js-cjs').log);

    expect(mainConfig?.readField('staticDirs')).toEqual(['./static', '../public']);
  });

  it('unwraps a default export off an evaluated module', async () => {
    const mainConfig = await readMainConfig(
      `${FIXTURES}/js-cjs-default-export/.storybook`,
      getDeps('js-cjs-default-export').log
    );

    expect(mainConfig?.readField('staticDirs')).toEqual(['./static', '../public']);
  });

  it('returns undefined when neither read path yields a config', async () => {
    const mainConfig = await readMainConfig(
      `${FIXTURES}/does-not-exist/.storybook`,
      getDeps('does-not-exist').log
    );

    expect(mainConfig).toBeUndefined();
  });
});

describe('getStorybookMetadata staticDirs discovery', () => {
  it.each([
    { project: 'ts-esm', shape: 'a parsed main.ts' },
    { project: 'js-cjs', shape: 'an evaluated cjs main.js' },
    { project: 'js-esm', shape: 'an esm main.js' },
    { project: 'js-esm-unrequirable', shape: "a main.js require() can't evaluate" },
    { project: 'mjs-esm', shape: 'a parsed main.mjs' },
    { project: 'cjs', shape: 'a parsed main.cjs' },
  ])('resolves staticDirs from $shape', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(metadata.staticDir).toEqual([
      `${FIXTURES}/${project}/.storybook/static`,
      `${FIXTURES}/${project}/public`,
    ]);
  });
});

describe('getStorybookMetadata fields visible on ctx.storybook', () => {
  it.each([
    { project: 'ts-esm', shape: 'a parsed main.ts', fields: ['staticDir', 'version'] },
    { project: 'mjs-esm', shape: 'a parsed main.mjs', fields: ['staticDir', 'version'] },
    { project: 'cjs', shape: 'a parsed main.cjs', fields: ['staticDir', 'version'] },
    { project: 'js-cjs', shape: 'an evaluated cjs main.js', fields: ['staticDir', 'version'] },
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
    { project: 'js-cjs-refs', shape: 'a main.js declaring refs', fields: ['refs', 'version'] },
    {
      project: 'js-cjs-refs-function',
      shape: 'a main.js declaring refs as a function',
      fields: ['version'],
    },
  ])('exposes exactly $fields for $shape', async ({ project, fields }) => {
    const metadata = await getStorybookMetadata(getDeps(project));

    expect(Object.keys(metadata).sort()).toEqual(fields);
  });

  it('exposes staticDir and version for an esm main.js regardless of the runtime read path', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-esm'));

    expect(Object.keys(metadata).sort()).toEqual(['staticDir', 'version']);
  });

  it('reports the refs declared by an evaluated config', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs-refs'));

    expect(metadata.refs).toEqual({
      design: { title: 'Design System', url: 'https://example.chromatic.com' },
    });
  });

  it('drops refs the config declares as a function, which we cannot evaluate', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs-refs-function'));

    expect(metadata.refs).toBeUndefined();
  });

  it('reports the builder declared by the framework field', async () => {
    const metadata = await getStorybookMetadata(getDeps('builder-js-esm'));

    expect(metadata.builder?.name).toBe('@storybook/react-vite');
  });
});
