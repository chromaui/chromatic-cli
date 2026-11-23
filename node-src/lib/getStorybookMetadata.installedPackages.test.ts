import { mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getStorybookMetadata } from './getStorybookMetadata';
import { allowPnpRuntime } from './installedPackages';

// Each test installs packages in its own project under a temporary directory, so this repository's
// own node_modules, which the CLI's working directory sits in, can't answer the lookups.

function installedPackage(name: string, version: string, directory = '') {
  return {
    [path.join(directory, `node_modules/${name}/package.json`)]: JSON.stringify({ name, version }),
  };
}

// A `.pnp.cjs` whose `setup` runs `setupBody`, standing in for Yarn's runtime.
function pnpFile(setupBody: string) {
  return { '.pnp.cjs': `exports.setup = () => { ${setupBody} };` };
}

describe('getStorybookMetadata installed packages', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'storybook-version-'));
  });

  afterEach(async () => {
    delete (globalThis as Record<string, unknown>).pnpSetUp;
    delete (process.versions as Record<string, string | undefined>).pnp;
    await rm(root, { recursive: true, force: true });
  });

  // A monorepo whose Storybook lives in `packages/ui`, with `files` written relative to its root.
  function writeProject(files: Record<string, string>) {
    for (const [file, contents] of Object.entries({
      'packages/ui/.storybook/main.js': `module.exports = { framework: '@storybook/react-vite' };`,
      ...files,
    })) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
    return { configDirectory: path.join(root, 'packages/ui/.storybook') };
  }

  // Under a fake runtime, `setup` makes `storybook` and the framework resolvable and marks the
  // runtime active, as Yarn's runtime would.
  const pnpRuntimeInstallingStorybook = pnpFile(`
    globalThis.pnpSetUp = true;
    process.versions.pnp = '3';
    const fs = require('fs');
    for (const [name, version] of [['storybook', '8.6.14'], ['@storybook/react-vite', '8.6.15']]) {
      fs.mkdirSync(__dirname + '/node_modules/' + name, { recursive: true });
      fs.writeFileSync(__dirname + '/node_modules/' + name + '/package.json', JSON.stringify({ version }));
    }
  `);

  async function readMetadata(configDirectory: string) {
    const deps = {
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
      options: { storybookConfigDir: configDirectory },
      env: {},
      packageJson: {},
    } as any;
    const metadata = await getStorybookMetadata(deps, root);
    const [versionLookup] = deps.log.debug.mock.calls.find(([info]) => Array.isArray(info))[0];
    return { metadata, versionLookup };
  }

  it('resolves the version and builder installed above the config directory', async () => {
    // The CLI runs from this repository, whose own node_modules holds another Storybook.
    const { configDirectory } = writeProject({
      ...installedPackage('storybook', '8.6.14'),
      ...installedPackage('@storybook/react-vite', '8.6.14'),
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBe('8.6.14');
    expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '8.6.14' });
  });

  it('reports no version when nothing is installed', async () => {
    const { configDirectory } = writeProject({});

    const { metadata, versionLookup } = await readMetadata(configDirectory);

    expect(metadata.version).toBeUndefined();
    expect(versionLookup.reason.message).toContain('Storybook package not installed');
  });

  // `allowPnpRuntime` can't be undone, so the refusal without it runs before any test that calls it.
  it("leaves a Plug'n'Play runtime unloaded unless an entry point allowed it", async () => {
    const { configDirectory } = writeProject(pnpRuntimeInstallingStorybook);

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBeUndefined();
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBeUndefined();
  });

  it("loads the Plug'n'Play runtime after a miss and tries again with the framework", async () => {
    allowPnpRuntime();
    const { configDirectory } = writeProject({
      // The package builds with its own older framework under a newer storybook at the root.
      ...pnpFile(`
        globalThis.pnpSetUp = true;
        process.versions.pnp = '3';
        const fs = require('fs');
        for (const [directory, name, version] of [
          ['', 'storybook', '10.6.5'],
          ['/packages/ui', '@storybook/react-vite', '7.6.20'],
        ]) {
          const packageDirectory = __dirname + directory + '/node_modules/' + name;
          fs.mkdirSync(packageDirectory, { recursive: true });
          fs.writeFileSync(packageDirectory + '/package.json', JSON.stringify({ name, version }));
        }
      `),
      // Neither evaluating this nor parsing it finds the framework until the runtime is loaded.
      'packages/ui/.storybook/main.js': `module.exports = {
        framework: require('path').dirname(require.resolve('@storybook/react-vite/package.json')),
      };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect((globalThis as Record<string, unknown>).pnpSetUp).toBe(true);
    expect(metadata.version).toBe('7.6.20');
    expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '7.6.20' });
  });

  it("doesn't load a Plug'n'Play runtime when the version resolves", async () => {
    allowPnpRuntime();
    const { configDirectory } = writeProject({
      ...installedPackage('storybook', '9.1.20'),
      ...pnpFile('globalThis.pnpSetUp = true;'),
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBe('9.1.20');
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBeUndefined();
  });

  it.each([
    {
      layout: 'an older Storybook in the package below a newer storybook at the root',
      framework: '@storybook/react',
      files: {
        ...installedPackage('storybook', '10.6.5'),
        ...installedPackage('@storybook/react', '6.5.16', 'packages/ui'),
        ...installedPackage('@storybook/core-common', '6.5.16', 'packages/ui'),
      },
      version: '6.5.16',
    },
    {
      layout: "a newer Storybook in the package below another project's renderer at the root",
      framework: '@storybook/react-vite',
      files: {
        ...installedPackage('@storybook/react', '7.6.20'),
        ...installedPackage('storybook', '10.6.5', 'packages/ui'),
        ...installedPackage('@storybook/react-vite', '10.6.5', 'packages/ui'),
      },
      version: '10.6.5',
    },
    {
      // npm leaves an old addon's core package in the package when it conflicts with the root's.
      layout: "a stray older core package in the package below the root's Storybook",
      framework: '@storybook/react-vite',
      files: {
        ...installedPackage('storybook', '8.6.14'),
        ...installedPackage('@storybook/react-vite', '8.6.14'),
        ...installedPackage('@storybook/core-common', '7.6.20', 'packages/ui'),
      },
      version: '8.6.14',
    },
    {
      // `getAbsolutePath(...)` gives the directory of the installation the config selected, which
      // a shared config can resolve from somewhere the config directory doesn't.
      layout: "a shared config's older framework named by its path, beside a newer one",
      framework: '<root>/tools/storybook-config/node_modules/@storybook/react',
      files: {
        ...installedPackage('storybook', '10.6.5'),
        ...installedPackage('@storybook/react', '10.6.5'),
        ...installedPackage('@storybook/react', '6.5.16', 'tools/storybook-config'),
      },
      version: '6.5.16',
    },
    {
      // Third-party frameworks have their own versions, which aren't Storybook's.
      layout: 'a third-party framework',
      framework: 'storybook-react-rsbuild',
      files: {
        ...installedPackage('storybook', '9.1.20'),
        ...installedPackage('storybook-react-rsbuild', '2.1.6'),
      },
      version: '9.1.20',
    },
  ])('reports the Storybook the framework builds with for $layout', async (layout) => {
    const { configDirectory } = writeProject({
      ...layout.files,
      'packages/ui/.storybook/main.js': `module.exports = { framework: ${JSON.stringify(
        layout.framework.replace('<root>', root)
      )} };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBe(layout.version);
  });

  it("reports the storybook pnpm installs beside the framework as the framework's peer", async () => {
    // With auto-installed peers, pnpm links `storybook` next to the framework in its store, where
    // only the framework can resolve it, and the package depends on the framework alone.
    const store = 'node_modules/.pnpm/@storybook+react-vite@8.6.14/node_modules';
    const { configDirectory } = writeProject({
      ...installedPackage('@storybook/react-vite', '8.6.14', path.dirname(store)),
      ...installedPackage('storybook', '8.6.14', path.dirname(store)),
    });
    mkdirSync(path.join(root, 'packages/ui/node_modules/@storybook'), { recursive: true });
    symlinkSync(
      path.join(root, store, '@storybook/react-vite'),
      path.join(root, 'packages/ui/node_modules/@storybook/react-vite')
    );

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBe('8.6.14');
  });

  it('reports the builder an evaluated path selects, named after its last node_modules', async () => {
    const { configDirectory } = writeProject({
      ...installedPackage('@storybook/react-vite', '8.6.14'),
      ...installedPackage('@storybook/react-vite', '8.6.15', 'node_modules/wrapper'),
      'packages/ui/.storybook/main.js': `module.exports = { framework: ${JSON.stringify(
        path.join(root, 'node_modules/wrapper/node_modules/@storybook/react-vite')
      )} };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '8.6.15' });
  });

  it.each([
    { core: `{ builder: 'webpack5' }`, builder: 'webpack5' },
    { core: '{}', builder: 'webpack4' },
  ])(
    "reports Storybook 6's builder, not the renderer it names as its framework, for core $core",
    async ({ core, builder }) => {
      const { configDirectory } = writeProject({
        ...installedPackage('@storybook/react', '6.5.16'),
        ...installedPackage(`@storybook/builder-${builder}`, '6.5.16'),
        'packages/ui/.storybook/main.js': `module.exports = {
          framework: '@storybook/react',
          core: ${core},
        };`,
      });

      const { metadata } = await readMetadata(configDirectory);

      expect(metadata.builder).toEqual({ name: builder, packageVersion: '6.5.16' });
    }
  );

  it('reports a third-party framework as the builder, whatever its version', async () => {
    const { configDirectory } = writeProject({
      ...installedPackage('storybook-react-rsbuild', '3.6.0'),
      'packages/ui/.storybook/main.js': `module.exports = { framework: 'storybook-react-rsbuild' };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.builder).toEqual({ name: 'storybook-react-rsbuild', packageVersion: '3.6.0' });
  });
});
