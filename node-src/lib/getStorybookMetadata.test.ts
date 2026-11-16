import { existsSync, readFileSync } from 'fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { findStaticDirectories, getStorybookMetadata } from './getStorybookMetadata';

type MainConfigReader = NonNullable<Parameters<typeof findStaticDirectories>[0]['mainConfig']>;

function makeConfig(returnValue: any): MainConfigReader {
  return { readField: vi.fn().mockReturnValue(returnValue) };
}

// The fixtures below represent a project at `/project` whose config lives in
// `/project/.storybook`.
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
      staticDirs: ['/project/.storybook/static', '/project/public'],
    });
  });

  it('extracts `from` from object entries and resolves relative to the config directory', () => {
    const config = makeConfig([
      { from: './static', to: '/' },
      { from: '../public', to: '/public' },
    ]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDirs: ['/project/.storybook/static', '/project/public'],
    });
  });

  it('handles mixed string and object entries', () => {
    const config = makeConfig(['./static', { from: '../public', to: '/' }]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDirs: ['/project/.storybook/static', '/project/public'],
    });
  });

  it('leaves resolved absolute paths unchanged', () => {
    const config = makeConfig(['/project/public']);
    expect(findProjectStaticDirectories(config)).toEqual({ staticDirs: ['/project/public'] });
  });

  it('reports a directory outside the project root as an absolute path', () => {
    const config = makeConfig(['./assets', { from: '../../../shared', to: '/shared' }]);
    expect(findProjectStaticDirectories(config)).toEqual({
      staticDirs: ['/project/.storybook/assets', '/shared'],
    });
  });

  it("merges the build script's -s with the config's staticDirs", () => {
    const config = makeConfig(['./assets']);
    expect(findProjectStaticDirectories(config, ['public'])).toEqual({
      staticDirs: ['/project/public', '/project/.storybook/assets'],
    });
  });

  it('dedupes directories that differ only in how they are written', () => {
    const config = makeConfig(['../public']);
    expect(findProjectStaticDirectories(config, ['./public', 'public'])).toEqual({
      staticDirs: ['/project/public'],
    });
  });

  it('returns the build script directories when there is no config to read', () => {
    expect(findProjectStaticDirectories(undefined, ['public'])).toEqual({
      staticDirs: ['/project/public'],
    });
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

function projectRootOf(project: string) {
  return path.resolve(FIXTURES, project);
}

describe('getStorybookMetadata without a readable main config', () => {
  it('reports no static directories and an unknown builder', async () => {
    const metadata = await getStorybookMetadata(
      getDeps('does-not-exist'),
      projectRootOf('does-not-exist')
    );

    expect(metadata.staticDirs).toBeUndefined();
    expect(metadata.builder).toEqual({ name: 'unknown', packageVersion: '0' });
  });
});

describe('getStorybookMetadata staticDirs discovery', () => {
  it.each([
    { project: 'ts-esm', shape: 'a parsed main.ts' },
    { project: 'js-cjs', shape: 'an evaluated cjs main.js' },
    { project: 'js-cjs-default-export', shape: 'an evaluated main.js with a default export' },
    { project: 'js-esm', shape: 'an esm main.js' },
    { project: 'js-esm-unrequirable', shape: "a main.js require() can't evaluate" },
    { project: 'mjs-esm', shape: 'a parsed main.mjs' },
    { project: 'cjs', shape: 'a parsed main.cjs' },
  ])('resolves staticDirs from $shape', async ({ project }) => {
    const metadata = await getStorybookMetadata(getDeps(project), projectRootOf(project));

    expect(metadata.staticDirs).toEqual([
      path.join(projectRootOf(project), '.storybook/static'),
      path.join(projectRootOf(project), 'public'),
    ]);
  });
});

describe('getStorybookMetadata absolute directories', () => {
  it('reports the config directory the CLI option names', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs'), projectRootOf('js-cjs'));

    expect(metadata.configDir).toBe(path.join(projectRootOf('js-cjs'), '.storybook'));
  });

  it('reports the same absolute paths when the supplied project root is nested', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-cjs'), projectRootOf('js-cjs/nested'));

    expect(metadata.configDir).toBe(path.join(projectRootOf('js-cjs'), '.storybook'));
    expect(metadata.staticDirs).toEqual([
      path.join(projectRootOf('js-cjs'), '.storybook/static'),
      path.join(projectRootOf('js-cjs'), 'public'),
    ]);
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

    expect(metadata.configDir).toBe(path.join(projectRootOf(project), '.storybook-ci'));
    expect(metadata.staticDirs).toEqual([
      path.join(projectRootOf(project), 'public'),
      path.join(projectRootOf(project), '.storybook-ci/static'),
    ]);
  });

  it('reads --storybook-config-dir relative to the project root', async () => {
    const project = 'js-cjs-base-dir';
    // The user wrote the option the way their build script's `-c` is written. There is no
    // `.storybook-nested` at the repo root, so only the project root's reading is on disk.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: '.storybook-nested' }),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe(path.join(projectRootOf(project), '.storybook-nested'));
    expect(metadata.staticDirs).toEqual([path.join(projectRootOf(project), 'public')]);
  });

  it('falls back to the cwd reading when the option does not resolve inside the project root', async () => {
    const project = 'js-cjs-base-dir';
    // The user wrote the option as documented, relative to where they run the CLI.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: `${FIXTURES}/js-cjs/.storybook` }),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe(path.join(projectRootOf('js-cjs'), '.storybook'));
  });

  it('prefers the project root reading when both directories exist', async () => {
    const project = 'js-cjs-base-dir';
    // This repo has its own `.storybook`, and so does the fixture standing in for the project root.
    // v1 has always ended up with the project's own, so a tie keeps resolving that way.
    const metadata = await getStorybookMetadata(
      getDeps(project, { storybookConfigDir: '.storybook' }),
      projectRootOf(project)
    );

    expect(metadata.configDir).toBe(path.join(projectRootOf(project), '.storybook'));
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

    expect(metadata.configDir).toBe(path.join(projectRootOf(project), '.storybook'));
  });
});

describe('getStorybookMetadata view layer lookup in node_modules', () => {
  // With no view layer pinned or listed in package.json, the version comes from whichever view
  // layer package is installed. This repo's own node_modules has some of them, but not all.
  it('reports the version of an installed view layer even though others are missing', async () => {
    const installed = ['@storybook/react', '@storybook/react-vite', '@storybook/html']
      .filter((pkg) => existsSync(`node_modules/${pkg}/package.json`))
      .map((pkg) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version);
    expect(installed).not.toHaveLength(0);

    const metadata = await getStorybookMetadata(
      { ...getDeps('js-cjs'), env: {} },
      projectRootOf('js-cjs')
    );

    expect(installed).toContain(metadata.version);
  });

  it('reports a missing package when none is installed', async () => {
    const emptyDirectory = await mkdtemp(path.join(tmpdir(), 'no-view-layer-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(emptyDirectory);
    try {
      const deps = { ...getDeps('js-cjs'), env: {} };
      const metadata = await getStorybookMetadata(deps, projectRootOf('js-cjs'));

      expect(metadata.version).toBeUndefined();
      const [versionLookup] = deps.log.debug.mock.calls.find(([info]) => Array.isArray(info))[0];
      expect(versionLookup.status).toBe('rejected');
      expect(versionLookup.reason.message).toContain('Storybook package not installed');
    } finally {
      cwd.mockRestore();
      await rm(emptyDirectory, { recursive: true });
    }
  });
});

async function install(directory: string, pkg: string, version: string) {
  await mkdir(path.join(directory, 'node_modules', pkg), { recursive: true });
  await writeFile(
    path.join(directory, 'node_modules', pkg, 'package.json'),
    JSON.stringify({ name: pkg, version })
  );
}

async function writeMainConfig(configDirectory: string, framework: string) {
  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    path.join(configDirectory, 'main.js'),
    `module.exports = { framework: { name: '${framework}' } };`
  );
}

function readMetadata(configDirectory: string, packageJson: Record<string, unknown>) {
  return getStorybookMetadata(
    {
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      options: { storybookConfigDir: configDirectory },
      env: {},
      packageJson,
    } as any,
    path.dirname(configDirectory)
  );
}

describe('getStorybookMetadata package resolution', () => {
  it('resolves packages from the config directory up to a hoisted install, not from the cwd', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hoisted-'));
    const cwd = vi
      .spyOn(process, 'cwd')
      .mockReturnValue(await mkdtemp(path.join(tmpdir(), 'cwd-')));
    try {
      const configDirectory = path.join(root, 'packages/ui/.storybook');
      await writeMainConfig(configDirectory, '@storybook/react-vite');
      for (const pkg of ['@storybook/react', '@storybook/react-vite']) {
        await install(root, pkg, '7.6.20');
      }

      const metadata = await readMetadata(configDirectory, {
        devDependencies: { '@storybook/react': '^7.6.0' },
      });

      expect(metadata.version).toBe('7.6.20');
      expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '7.6.20' });
    } finally {
      cwd.mockRestore();
      await rm(root, { recursive: true });
    }
  });

  it("takes the view layer linked nearest the config directory over another project's", async () => {
    // A pnpm monorepo whose root installs React for another package, while this package uses Vue.
    // Both live in the root's store, so only the links say which one belongs to this package.
    const root = await mkdtemp(path.join(tmpdir(), 'mixed-'));
    try {
      const configDirectory = path.join(root, 'packages/ui/.storybook');
      await writeMainConfig(configDirectory, '@storybook/vue3-vite');
      const links: [string, string, string][] = [
        [root, '@storybook/react', '7.6.20'],
        [path.join(root, 'packages/ui'), '@storybook/vue3', '10.6.5'],
        [path.join(root, 'packages/ui'), '@storybook/vue3-vite', '10.6.5'],
      ];
      for (const [directory, pkg, version] of links) {
        const store = path.join(root, 'node_modules/.pnpm', `${pkg.replace('/', '+')}@${version}`);
        await install(store, pkg, version);
        await mkdir(path.join(directory, 'node_modules/@storybook'), { recursive: true });
        await symlink(
          path.join(store, 'node_modules', pkg),
          path.join(directory, 'node_modules', pkg),
          'junction'
        );
      }

      const metadata = await readMetadata(configDirectory, {
        devDependencies: { '@storybook/vue3-vite': '^10.6.0', storybook: '^10.6.0' },
      });

      expect(metadata.version).toBe('10.6.5');
    } finally {
      await rm(root, { recursive: true });
    }
  });
});

describe('getStorybookMetadata fields visible on ctx.storybook', () => {
  it.each([
    {
      project: 'ts-esm',
      shape: 'a parsed main.ts',
      fields: ['configDir', 'staticDirs', 'version'],
    },
    {
      project: 'mjs-esm',
      shape: 'a parsed main.mjs',
      fields: ['configDir', 'staticDirs', 'version'],
    },
    { project: 'cjs', shape: 'a parsed main.cjs', fields: ['configDir', 'staticDirs', 'version'] },
    {
      project: 'js-cjs',
      shape: 'an evaluated cjs main.js',
      fields: ['configDir', 'staticDirs', 'version'],
    },
    {
      project: 'js-esm-unrequirable',
      shape: 'a parsed main.js',
      fields: ['configDir', 'staticDirs', 'version'],
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

  it('exposes staticDirs and version for an esm main.js regardless of the runtime read path', async () => {
    const metadata = await getStorybookMetadata(getDeps('js-esm'), projectRootOf('js-esm'));

    expect(Object.keys(metadata).sort()).toEqual(['configDir', 'staticDirs', 'version']);
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

    expect(metadata.builder?.name).toBe('@storybook/html-vite');
  });
});
