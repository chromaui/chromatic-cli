import path from 'path';
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

// The directories arrive absolute and leave relative to the project root, so the fixtures below are
// written against a project at `/project` whose config lives in `/project/.storybook`.
function findProjectStaticDirectories(
  mainConfig?: MainConfigReader,
  buildScriptStaticDirectories?: string[]
) {
  return findStaticDirectories({
    mainConfig,
    configDirectory: '/project/.storybook',
    buildScriptStaticDirs: buildScriptStaticDirectories,
    projectRoot: '/project',
  });
}

describe('findStaticDirectories', () => {
  it('returns string entries resolved relative to the config directory', () => {
    const config = makeConfig(['./static', '../public']);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('extracts `from` from object entries and resolves relative to the config directory', () => {
    const config = makeConfig([
      { from: './static', to: '/' },
      { from: '../public', to: '/public' },
    ]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('handles mixed string and object entries', () => {
    const config = makeConfig(['./static', { from: '../public', to: '/' }]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDir: ['.storybook/static', 'public'],
    });
  });

  it('rewrites absolute paths as project-relative ones', () => {
    const config = makeConfig(['/project/public']);
    expect(findProjectStaticDirectories(config)).toEqual({ staticDir: ['public'] });
  });

  it('reports a directory outside the project root as an ascending path', () => {
    const config = makeConfig(['./assets', { from: '../../../shared', to: '/shared' }]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDir: ['.storybook/assets', '../shared'],
    });
  });

  it("merges the build script's -s with the config's staticDirs", () => {
    const config = makeConfig(['./assets']);
    expect(findProjectStaticDirectories(config, ['public'])).toEqual({
      staticDir: ['public', '.storybook/assets'],
    });
  });

  it('dedupes directories that differ only in how they are written', () => {
    const config = makeConfig(['../public']);
    expect(findProjectStaticDirectories(config, ['./public', 'public'])).toEqual({
      staticDir: ['public'],
    });
  });

  it('returns the build script directories when there is no config to read', () => {
    expect(findProjectStaticDirectories(undefined, ['public'])).toEqual({ staticDir: ['public'] });
  });

  it('returns {} for empty array', () => {
    expect(findProjectStaticDirectories(makeConfig([]))).toEqual({});
  });

  it('returns {} when the main config could not be read', () => {
    expect(findProjectStaticDirectories(undefined)).toEqual({});
  });

  it('returns {} when staticDirs is not present on config', () => {
    expect(findProjectStaticDirectories(makeConfig(undefined))).toEqual({});
  });

  it('returns {} when staticDirs is a non-array value', () => {
    expect(findProjectStaticDirectories(makeConfig('./static'))).toEqual({});
  });

  it('returns {} when all entries have no valid path', () => {
    expect(findProjectStaticDirectories(makeConfig([null, undefined, { to: '/' }]))).toEqual({});
  });
});

// Each fixture is a real project directory, because whether `require()` of the config succeeds
// depends on the file's extension and the nearest package.json `type`.
const FIXTURES = 'node-src/__mocks__/storybookMainConfig';

function getDeps(
  project: string,
  options: Record<string, unknown> = {},
  // The package.json found by walking up from the cwd, which is where the build script is read from.
  packageJson: Record<string, unknown> = {}
) {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    options: { storybookConfigDir: `${FIXTURES}/${project}/.storybook`, ...options },
    // Pinned so the viewlayer lookup can't reach into this repo's own node_modules.
    env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/react@8.0.0' },
    packageJson,
  } as any;
}

// The CLI runs at the repo root in these tests, so each fixture stands in for a project root the
// reported directories come back relative to.
function projectRootOf(project: string) {
  return path.resolve(FIXTURES, project);
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
    const metadata = await getStorybookMetadata(getDeps(project), projectRootOf(project));

    expect(metadata.staticDir).toEqual(['.storybook/static', 'public']);
  });
});

describe('getStorybookMetadata directories relative to the project root', () => {
  it('reports the config directory the CLI option names', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs'), projectRootOf('js-cjs'));

    expect(metadata.configDir).toBe('.storybook');
  });

  it('reports a project root the CLI does not run in as an ascending path', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs'), projectRootOf('js-cjs/nested'));

    expect(metadata.configDir).toBe('../.storybook');
    expect(metadata.staticDir).toEqual(['../.storybook/static', '../public']);
  });

  it("resolves the build script's -c and -s against the project root", async () => {
    const project = 'js-cjs-alt-config-dir';
    // The CLI runs at the repo root, so a flag resolved against the cwd would land outside the
    // fixture. The `-c` also locates the main config, so its `staticDirs` are found too.
    const metadata = await getStorybookMetadata(
      getDeps(
        project,
        { storybookConfigDir: undefined, buildScriptName: 'build-storybook' },
        { scripts: { 'build-storybook': 'storybook build -c .storybook-ci -s public' } }
      ),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe('.storybook-ci');
    expect(metadata.staticDir).toEqual(['public', '.storybook-ci/static']);
  });

  it('reads --storybook-config-dir relative to the project root', async () => {
    const project = 'js-cjs-base-dir';
    // The user wrote the option the way their build script's `-c` is written. There is no
    // `.storybook-nested` at the repo root, so only the project root's reading is on disk.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: '.storybook-nested' }),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe('.storybook-nested');
    expect(metadata.staticDir).toEqual(['public']);
  });

  it('falls back to the cwd reading when the option does not resolve inside the project root', async () => {
    const project = 'js-cjs-base-dir';
    // The user wrote the option as documented, relative to where they run the CLI.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: `${FIXTURES}/js-cjs/.storybook` }),
      projectRootOf(project)
    );

    // The two fixtures are siblings, so the config directory sits one level over.
    expect(metadata.configDir).toBe('../js-cjs/.storybook');
  });

  it('prefers the project root reading when both directories exist', async () => {
    const project = 'js-cjs-base-dir';
    // This repo has its own `.storybook`, and so does the fixture standing in for the project root.
    // v1 has always ended up with the project's own, so a tie keeps resolving that way.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: '.storybook' }),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe('.storybook');
  });

  it('lets the CLI option win over the build script', async () => {
    const project = 'js-cjs-alt-config-dir';
    const metadata = await getStorybookMetadata(
      getDeps(
        project,
        { buildScriptName: 'build-storybook' },
        { scripts: { 'build-storybook': 'storybook build -c .storybook-ci' } }
      ),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe('.storybook');
  });
});

describe('getStorybookMetadata fields visible on ctx.storybook', () => {
  it.each([
    { project: 'ts-esm', shape: 'a parsed main.ts', fields: ['configDir', 'staticDir', 'version'] },
    {
      project: 'mjs-esm',
      shape: 'a parsed main.mjs',
      fields: ['configDir', 'staticDir', 'version'],
    },
    { project: 'cjs', shape: 'a parsed main.cjs', fields: ['configDir', 'staticDir', 'version'] },
    {
      project: 'js-cjs',
      shape: 'an evaluated cjs main.js',
      fields: ['configDir', 'staticDir', 'version'],
    },
    {
      project: 'js-esm-unrequirable',
      shape: 'a parsed main.js',
      fields: ['configDir', 'staticDir', 'version'],
    },
    {
      project: 'builder-js-esm',
      shape: 'a main.js declaring a framework',
      fields: ['builder', 'configDir', 'version'],
    },
    {
      project: 'js-cjs-refs',
      shape: 'a main.js declaring refs',
      fields: ['configDir', 'refs', 'version'],
    },
    {
      project: 'js-cjs-refs-function',
      shape: 'a main.js declaring refs as a function',
      fields: ['configDir', 'version'],
    },
  ])('exposes exactly $fields for $shape', async ({ project, fields }) => {
    const metadata = await getStorybookMetadata(getDeps(project), projectRootOf(project));

    expect(Object.keys(metadata).sort()).toEqual(fields);
  });

  it('exposes staticDir and version for an esm main.js regardless of the runtime read path', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-esm'), projectRootOf('js-esm'));

    expect(Object.keys(metadata).sort()).toEqual(['configDir', 'staticDir', 'version']);
  });

  it('reports the refs declared by an evaluated config', async () => {
    const metadata = await getStorybookMetadata(
      getDeps('js-cjs-refs'),
      projectRootOf('js-cjs-refs')
    );

    expect(metadata.refs).toEqual({
      design: { title: 'Design System', url: 'https://example.chromatic.com' },
    });
  });

  it('drops refs the config declares as a function, which we cannot evaluate', async () => {
    const metadata = await getStorybookMetadata(
      getDeps('js-cjs-refs-function'),
      projectRootOf('js-cjs-refs-function')
    );

    expect(metadata.refs).toBeUndefined();
  });

  it('reports the builder declared by the framework field', async () => {
    const metadata = await getStorybookMetadata(
      getDeps('builder-js-esm'),
      projectRootOf('builder-js-esm')
    );

    expect(metadata.builder?.name).toBe('@storybook/react-vite');
  });
});
