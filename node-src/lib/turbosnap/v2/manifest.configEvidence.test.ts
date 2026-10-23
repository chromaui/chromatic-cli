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
import { buildManifest, serializeManifest } from './manifest';

const configDirectory = `${projectRoot}/.storybook`;
const main = `${configDirectory}/main.ts`;
const preview = `${configDirectory}/preview.ts`;
const helper = `${configDirectory}/data.json`;
const unused = `${configDirectory}/unused.ts`;
const button = `${projectRoot}/src/Button.stories.tsx`;
const header = `${projectRoot}/src/Header.stories.tsx`;
const outputDirectory = `${projectRoot}/storybook-static`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const relative = (file: string) =>
  `./${path.relative(projectRoot, file).split(path.sep).join('/')}`;

function fixture() {
  const fixture = createFixture({
    directories: {
      [configDirectory]: ['main.ts', 'preview.ts', 'data.json', 'unused.ts'],
      [outputDirectory]: ['iframe.html'],
    },
    isAbsent: syntheticAbsent,
  });
  fixture.input.outputDir = outputDirectory;
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

function evidence({ input, disk }: ManifestFixture, stats: Stats) {
  const configFiles = input.projectFiles.listTree(input.configDir);
  const output = `${outputDirectory}/iframe.html`;
  disk.sha256Hashes = Object.fromEntries(
    [...configFiles, output].map((file) => [file, sha256(disk.fileHashes?.[file] ?? 'x')])
  );
  return {
    version: 1,
    status: 'complete',
    reason: 'final-output',
    builder: { name: '@storybook/builder-vite', version: '11.0.0' },
    projectRoot: './',
    configDir: './.storybook',
    modulesHash: sha256(JSON.stringify(stats.modules)),
    configFiles: Object.fromEntries(
      configFiles.map((file) => [
        relative(file),
        { hash: disk.sha256Hashes?.[file] ?? '', realPath: relative(file) },
      ])
    ),
    outputFiles: { 'iframe.html': disk.sha256Hashes[output] },
    globalOutputHash: sha256('global'),
    storyOutputHashes: {
      './src/Button.stories.tsx': sha256('button'),
      './src/Header.stories.tsx': sha256('header'),
    },
  };
}

async function build(context: ReturnType<typeof fixture>) {
  return buildManifest(
    { ...context.stats, turbosnapOutput: evidence(context, context.stats) },
    context.input
  );
}

describe('conditional TurboSnap 2 config coverage', () => {
  it('retains every legacy hash and supplies a narrower comparison as separate evidence', async () => {
    const context = fixture();
    const legacy = await buildManifest(context.stats, context.input);
    const before = await build(context);
    expect(before.storyFileHashes).toEqual(legacy.storyFileHashes);
    expect(before.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
    expect(before.outOfGraphFiles).toEqual(legacy.outOfGraphFiles);
    context.disk.fileHashes = { [helper]: 'changed' };
    const after = await build(context);
    expect(after.storybookConfigHashes).not.toEqual(before.storybookConfigHashes);
    expect(after.configCoverage?.stableConfigHash).toBe(before.configCoverage?.stableConfigHash);
    expect(after.storyFileHashes.get(relative(button))).not.toBe(
      before.storyFileHashes.get(relative(button))
    );
    expect(after.storyFileHashes.get(relative(header))).toBe(
      before.storyFileHashes.get(relative(header))
    );
    expect(after.outOfGraphFiles.storybookConfigFiles.has(relative(helper))).toBe(true);
    expect(serializeManifest(after).configCoverage).toEqual(after.configCoverage);
  });

  it.each([main, preview, unused])('keeps %s in the stable config comparison', async (file) => {
    const context = fixture();
    const before = await build(context);
    context.disk.fileHashes = { [file]: 'changed' };
    const after = await build(context);
    expect(after.configCoverage?.stableConfigHash).not.toBe(
      before.configCoverage?.stableConfigHash
    );
  });

  it('keeps a helper shared by preview and a story global', async () => {
    const context = fixture();
    context.stats.modules.push({ id: 5, name: helper, reasons: [{ moduleName: preview }] });
    const before = await build(context);
    context.disk.fileHashes = { [helper]: 'changed' };
    const after = await build(context);
    expect(after.configAnalysis.globalFiles).toContain(relative(helper));
    expect(after.configCoverage?.stableConfigHash).not.toBe(
      before.configCoverage?.stableConfigHash
    );
  });

  it('includes output evidence in record identity without changing source capture decisions', async () => {
    const context = fixture();
    const before = await build(context);
    const metadata = evidence(context, context.stats);
    metadata.storyOutputHashes['./src/Header.stories.tsx'] = sha256('hidden transform effect');
    const after = await buildManifest(
      { ...context.stats, turbosnapOutput: metadata },
      context.input
    );
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
    expect(after.configCoverage?.storyOutputHashes).not.toEqual(
      before.configCoverage?.storyOutputHashes
    );
  });

  it.each(['untraced', 'gitignored'])(
    'preserves source decisions for a %s-only edit even when rebuilt output changes',
    async (reason) => {
      const context = fixture();
      if (reason === 'untraced') context.input.untraced = ['packages/ui/.storybook/data.json'];
      else context.disk.isIgnored = (file) => file === helper;
      const before = await build(context);
      context.disk.fileHashes = { [helper]: 'changed' };
      const metadata = evidence(context, context.stats);
      metadata.globalOutputHash = sha256('changed output');
      const after = await buildManifest(
        { ...context.stats, turbosnapOutput: metadata },
        context.input
      );
      expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
      expect(after.storyFileHashes).toEqual(before.storyFileHashes);
      expect(after.configAnalysis.storyScopedCandidates).not.toContain(relative(helper));
    }
  );

  it('preserves broad exclusions and main/externals exceptions', async () => {
    const context = fixture();
    context.input.untraced = ['packages/ui/.storybook/**'];
    context.input.externals = ['packages/ui/.storybook/data.json'];
    context.disk.trackedFiles = [helper];
    const legacy = await buildManifest(context.stats, context.input);
    const after = await build(context);
    expect(after.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
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
      metadata.builder.name = '@storybook/unknown';
    },
    status: (metadata) => {
      metadata.status = 'incomplete';
    },
    stats: (metadata) => {
      metadata.modulesHash = sha256('stale graph');
    },
    source: (metadata) => {
      metadata.configFiles[relative(helper)].hash = sha256('stale source');
    },
    inventory: (_metadata, context) => {
      context.disk.directories?.[configDirectory].push('new.json');
    },
    output: (metadata) => {
      metadata.outputFiles['iframe.html'] = sha256('stale output');
    },
    root: (metadata) => {
      metadata.configDir = './another';
    },
    missingStory: (metadata) => {
      Reflect.deleteProperty(metadata.storyOutputHashes, './src/Header.stories.tsx');
    },
    symlink: (metadata) => {
      metadata.configFiles[relative(helper)].realPath = './another/data.json';
    },
  };
  it.each(Object.keys(invalidations))(
    'retains legacy coverage when the %s check fails',
    async (failure) => {
      const context = fixture();
      const metadata = evidence(context, context.stats);
      invalidations[failure](metadata, context);
      const legacy = await buildManifest(context.stats, context.input);
      const after = await buildManifest(
        { ...context.stats, turbosnapOutput: metadata },
        context.input
      );
      expect(after.configAnalysis.mode).toBe('directory');
      expect(after.configCoverage).toBeUndefined();
      expect(after.storybookHash).toBe(legacy.storybookHash);
      expect(after.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
      expect(after.storyFileHashes).toEqual(legacy.storyFileHashes);
    }
  );
});
