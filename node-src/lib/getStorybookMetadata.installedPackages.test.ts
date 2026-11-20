import { mkdirSync, writeFileSync } from 'fs';
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

  // Under a fake runtime, `setup` makes `storybook` and the framework resolvable, as Yarn's runtime
  // would.
  const pnpRuntimeInstallingStorybook = pnpFile(`
    globalThis.pnpSetUp = true;
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

  it("loads the Plug'n'Play runtime after a miss and tries again", async () => {
    allowPnpRuntime();
    const { configDirectory } = writeProject({
      ...pnpRuntimeInstallingStorybook,
      // Neither evaluating this nor parsing it finds the framework until the runtime is loaded.
      'packages/ui/.storybook/main.js': `module.exports = {
        framework: require('path').dirname(require.resolve('@storybook/react-vite/package.json')),
      };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect((globalThis as Record<string, unknown>).pnpSetUp).toBe(true);
    expect(metadata.version).toBe('8.6.14');
    expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '8.6.15' });
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
      files: {
        ...installedPackage('storybook', '10.6.5'),
        ...installedPackage('@storybook/react', '6.5.16', 'packages/ui'),
        ...installedPackage('@storybook/core-common', '6.5.16', 'packages/ui'),
      },
      version: '6.5.16',
    },
    {
      layout: "a newer storybook in the package below another project's renderer at the root",
      files: {
        ...installedPackage('@storybook/react', '7.6.20'),
        ...installedPackage('storybook', '10.6.5', 'packages/ui'),
      },
      version: '10.6.5',
    },
  ])('reports the Storybook nearest the config directory for $layout', async (layout) => {
    const { configDirectory } = writeProject(layout.files);

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.version).toBe(layout.version);
  });

  it('reports the package an evaluated path names after its last node_modules', async () => {
    const { configDirectory } = writeProject({
      ...installedPackage('@storybook/react-vite', '8.6.14'),
      'packages/ui/.storybook/main.js': `module.exports = { framework: ${JSON.stringify(
        path.join(root, 'node_modules/wrapper/node_modules/@storybook/react-vite')
      )} };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.builder).toEqual({ name: '@storybook/react-vite', packageVersion: '8.6.14' });
  });

  it("reports Storybook 6's core.builder over the renderer it names as its framework", async () => {
    const { configDirectory } = writeProject({
      ...installedPackage('@storybook/react', '6.5.16'),
      ...installedPackage('@storybook/builder-webpack5', '6.5.16'),
      'packages/ui/.storybook/main.js': `module.exports = {
        framework: '@storybook/react',
        core: { builder: 'webpack5' },
      };`,
    });

    const { metadata } = await readMetadata(configDirectory);

    expect(metadata.builder).toEqual({ name: 'webpack5', packageVersion: '6.5.16' });
  });
});
