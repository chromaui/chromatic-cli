import { createHash } from 'crypto';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  createFixture,
  ManifestFixture,
  projectRoot,
  syntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest } from './manifest';

const configDirectory = `${projectRoot}/.storybook`;
const main = `${configDirectory}/main.ts`;
const preview = `${configDirectory}/preview.ts`;
const helper = `${configDirectory}/data.json`;
const unused = `${configDirectory}/unused.ts`;
const button = `${projectRoot}/src/Button.stories.tsx`;
const header = `${projectRoot}/src/Header.stories.tsx`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const relative = (file: string) => `./${path.relative(projectRoot, file)}`;

function fixture() {
  const fixture = createFixture({
    packageVersions: { storybook: '10.4.0', '@storybook/builder-vite': '10.4.0', vite: '7.3.1' },
    directories: { [configDirectory]: ['main.ts', 'preview.ts', 'data.json', 'unused.ts'] },
    isAbsent: syntheticAbsent,
  });
  const stats: Stats = {
    modules: [
      { id: 1, name: button, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: header, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 3, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      { id: 4, name: helper, reasons: [{ moduleName: button }] },
    ],
  };
  return { ...fixture, stats };
}

function evidence(
  { input, disk }: ManifestFixture,
  stats: Stats,
  buildDependencies: string[] = []
) {
  const configFiles = input.projectFiles.listTree(input.configDir);
  const files = [...new Set([...configFiles, ...buildDependencies])];
  disk.sha256Hashes = Object.fromEntries(
    files.map((file) => [file, sha256(disk.fileHashes?.[file] ?? 'x')])
  );
  return {
    version: 1,
    status: 'complete',
    reason: 'supported-profile',
    builder: { name: '@storybook/builder-vite', version: '10.4.0', viteVersion: '7.3.1' },
    projectRoot: './',
    configDir: './.storybook',
    modulesHash: sha256(JSON.stringify(stats.modules)),
    environmentHash: sha256('production'),
    configFiles: configFiles.map((file) => relative(file)),
    absentFiles: [] as string[],
    roots: [relative(main)],
    files: Object.fromEntries(
      files.map((file) => [
        relative(file),
        {
          hash: disk.sha256Hashes?.[file] ?? '',
          realPath: relative(file),
          dependencies: file === main ? buildDependencies.map((file) => relative(file)) : [],
        },
      ])
    ),
  };
}

describe('verified TurboSnap 2 config coverage', () => {
  it('scopes a config-directory helper to its stories after a fresh supported build', async () => {
    const context = fixture();
    const { input, disk, stats } = context;
    const before = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats) },
      input
    );
    disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats) },
      input
    );
    expect(after.configAnalysis.mode).toBe('dependencies');
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storyFileHashes.get('./src/Header.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Header.stories.tsx')
    );
    expect(after.outOfGraphFiles.storybookConfigFiles.has('./.storybook/data.json')).toBe(false);
  });

  it.each([
    helper,
    `${projectRoot}/build/transform.ts`,
    `${projectRoot}/build/shared!settings.json`,
    `${projectRoot}/build/shared?settings.json`,
    `${projectRoot}/build/settings + 2 modules`,
    `${projectRoot}/build!/settings.json`,
  ])('keeps a build input global: %s', async (dependency) => {
    const context = fixture();
    const { input, disk, stats } = context;
    const before = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats, [dependency]) },
      input
    );
    disk.fileHashes = { [dependency]: 'changed' };
    const after = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats, [dependency]) },
      input
    );
    expect(after.configAnalysis.mode).toBe('dependencies');
    expect(after.storybookConfigHashes.get('buildConfiguration')).not.toBe(
      before.storybookConfigHashes.get('buildConfiguration')
    );
    expect(after.configAnalysis.storyScopedCandidates).not.toContain(relative(dependency));
  });

  it.each([main, preview, unused])('retains conservative coverage for %s', async (file) => {
    const context = fixture();
    const { input, disk, stats } = context;
    const before = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats) },
      input
    );
    disk.fileHashes = { [file]: 'changed' };
    const after = await buildManifest(
      { ...stats, turbosnapConfig: evidence(context, stats) },
      input
    );
    expect(after.storybookConfigHashes).not.toEqual(before.storybookConfigHashes);
  });

  it('keeps a helper shared by a story and preview global', async () => {
    const context = fixture();
    context.stats.modules.push({ id: 5, name: helper, reasons: [{ moduleName: preview }] });
    const before = await buildManifest(
      { ...context.stats, turbosnapConfig: evidence(context, context.stats) },
      context.input
    );
    context.disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(
      { ...context.stats, turbosnapConfig: evidence(context, context.stats) },
      context.input
    );
    expect(after.configAnalysis.mode).toBe('dependencies');
    expect(after.configAnalysis.globalFiles).toContain('./.storybook/data.json');
    expect(after.storybookConfigHashes).not.toEqual(before.storybookConfigHashes);
  });

  it('includes resolved environment changes in global coverage', async () => {
    const context = fixture();
    const metadata = evidence(context, context.stats);
    const before = await buildManifest(
      { ...context.stats, turbosnapConfig: metadata },
      context.input
    );
    const after = await buildManifest(
      { ...context.stats, turbosnapConfig: { ...metadata, environmentHash: sha256('changed') } },
      context.input
    );
    expect(after.configAnalysis.mode).toBe('dependencies');
    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
    expect(after.storybookConfigHashes.get('buildConfiguration')).not.toBe(
      before.storybookConfigHashes.get('buildConfiguration')
    );
  });

  it('changes the version gate once when moving from legacy coverage to verified coverage', async () => {
    const context = fixture();
    const legacy = await buildManifest(context.stats, context.input);
    const stats = { ...context.stats, turbosnapConfig: evidence(context, context.stats) };
    const first = await buildManifest(stats, context.input);
    const repeated = await buildManifest(stats, context.input);
    expect(first.storybookConfigHashes.get('configDependencyVersion')).toBe('1');
    expect(legacy.storybookConfigHashes.has('configDependencyVersion')).toBe(false);
    expect(first.storybookHash).not.toBe(legacy.storybookHash);
    expect(repeated.storybookHash).toBe(first.storybookHash);
  });

  it('preserves an untraced story helper without hashing its binding digest globally', async () => {
    const context = fixture();
    context.input.untraced = ['packages/ui/.storybook/data.json'];
    const metadata = evidence(context, context.stats);
    const stats = { ...context.stats, turbosnapConfig: metadata };
    const before = await buildManifest(stats, context.input);
    context.disk.fileHashes = { [helper]: 'changed' };
    context.disk.sha256Hashes = { ...context.disk.sha256Hashes, [helper]: sha256('changed') };
    const after = await buildManifest(stats, context.input);
    expect(after.configAnalysis.mode).toBe('dependencies');
    expect(after.storybookHash).toBe(before.storybookHash);
  });

  it.each(['untraced', 'gitignored'])(
    'falls back without bypassing a %s build dependency',
    async (reason) => {
      const context = fixture();
      if (reason === 'untraced') context.input.untraced = ['packages/ui/.storybook/data.json'];
      else context.disk.isIgnored = (file) => file === helper;
      const legacy = await buildManifest(context.stats, context.input);
      const after = await buildManifest(
        { ...context.stats, turbosnapConfig: evidence(context, context.stats, [helper]) },
        context.input
      );
      expect(after.configAnalysis.reason).toBe('excluded-build-dependency');
      expect(after.storybookHash).toBe(legacy.storybookHash);
      expect(after.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
    }
  );

  it('preserves broad config exclusions and the main/externals exceptions', async () => {
    const context = fixture();
    context.input.untraced = ['packages/ui/.storybook/**'];
    context.input.externals = ['packages/ui/.storybook/data.json'];
    context.disk.trackedFiles = [helper];
    const metadata = evidence(context, context.stats);
    const legacy = await buildManifest(context.stats, context.input);
    const after = await buildManifest(
      { ...context.stats, turbosnapConfig: metadata },
      context.input
    );
    expect(after.configAnalysis.reason).toBe('excluded-build-dependency');
    expect(after.storybookHash).toBe(legacy.storybookHash);
    expect([...after.outOfGraphFiles.storybookConfigFiles.keys()]).toEqual([
      './.storybook/main.ts',
    ]);
    expect([...after.outOfGraphFiles.externals.keys()]).toEqual(['./.storybook/data.json']);
  });

  const invalidations: Record<
    string,
    (metadata: ReturnType<typeof evidence>, context: ReturnType<typeof fixture>) => void
  > = {
    version: (metadata) => {
      metadata.version = 2;
    },
    builder: (metadata) => {
      metadata.builder.version = '99.0.0';
    },
    status: (metadata) => {
      metadata.status = 'incomplete';
    },
    stats: (metadata) => {
      metadata.modulesHash = sha256('stale graph');
    },
    source: (metadata) => {
      metadata.files[relative(helper)].hash = sha256('stale source');
    },
    inventory: (_metadata, context) => {
      context.disk.directories?.[configDirectory].push('tsconfig.json');
    },
    absence: (metadata) => {
      metadata.absentFiles.push('./vite.config.ts');
    },
    root: (metadata) => {
      metadata.configDir = './another';
    },
    edge: (metadata) => {
      metadata.files[relative(main)].dependencies.push('./missing.ts');
    },
    symlink: (metadata) => {
      metadata.files[relative(helper)].realPath = './another/data.json';
    },
  };

  it.each(Object.keys(invalidations))(
    'preserves legacy hashes when evidence fails its %s check',
    async (failure) => {
      const context = fixture();
      const metadata = evidence(context, context.stats);
      invalidations[failure](metadata, context);
      const legacy = await buildManifest(context.stats, context.input);
      const after = await buildManifest(
        { ...context.stats, turbosnapConfig: metadata },
        context.input
      );
      expect(after.configAnalysis.mode).toBe('directory');
      expect(after.storybookHash).toBe(legacy.storybookHash);
      expect(after.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
    }
  );
});
