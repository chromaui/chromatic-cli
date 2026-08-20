import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  createFixture,
  manifestWithPreview,
  syntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, getManifestPath, serializeManifest, writeManifest } from './manifest';

describe('serializeManifest', () => {
  it('converts the manifest maps and sets into JSON-safe objects and arrays', async () => {
    const { input } = createFixture({
      fileHashes: {
        '/repo/packages/ui/src/Button.stories.tsx': 'S',
        '/repo/packages/ui/src/helper.ts': 'H',
      },
    });
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: '/repo/packages/ui/src/Button.stories.tsx',
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
        {
          id: 2,
          name: '/repo/packages/ui/src/helper.ts',
          reasons: [{ moduleName: '/repo/packages/ui/src/Button.stories.tsx' }],
        },
      ],
    };

    const manifest = await buildManifest(stats, input);
    const serialized = serializeManifest(manifest);

    // JSON-safe: storyFiles is a plain object, dependencies is an array.
    expect(serialized.storybookHash).toBe(manifest.storybookHash);
    expect(serialized.storyFiles).toEqual(Object.fromEntries(manifest.storyFileHashes));
    expect(serialized.files['./src/Button.stories.tsx'].dependencies).toEqual(['./src/helper.ts']);
    // structuredClone can hide fields that are not friendly to JSON.parse/JSON>stringify so we test the exact flow instead.
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('emits storybookConfigHashes as a JSON-safe object', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const preview = '/repo/packages/ui/.storybook/preview.ts';
    const { input } = createFixture({ fileHashes: { [story]: 'S', [preview]: 'P' } });
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      ],
    };

    const manifest = await buildManifest(stats, input);
    const serialized = serializeManifest(manifest);

    expect(serialized.storybookConfigHashes.preview).toBe(
      manifest.storybookConfigHashes.get('preview')
    );
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('sorts file dependencies regardless of their insertion order', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const alpha = '/repo/packages/ui/src/alpha.ts';
    const zulu = '/repo/packages/ui/src/zulu.ts';
    const { input } = createFixture({
      fileHashes: { [story]: 'S', [alpha]: 'A', [zulu]: 'Z' },
    });
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: zulu, reasons: [{ moduleName: story }] },
        { id: 3, name: alpha, reasons: [{ moduleName: story }] },
      ],
    };

    const serialized = serializeManifest(await buildManifest(stats, input));

    expect(serialized.files['./src/Button.stories.tsx'].dependencies).toEqual([
      './src/alpha.ts',
      './src/zulu.ts',
    ]);
  });

  it('sorts the file keys so two builds of the same Storybook serialize identically', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const zulu = '/repo/packages/ui/src/zulu.ts';
    const alpha = '/repo/packages/ui/src/alpha.ts';
    const { input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { [story]: 'S', [zulu]: 'Z', [alpha]: 'A' },
    });
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: zulu, reasons: [{ moduleName: story }] },
        { id: 3, name: alpha, reasons: [{ moduleName: story }] },
      ],
    };

    const serialized = serializeManifest(await buildManifest(stats, input));

    expect(Object.keys(serialized.files)).toEqual([
      './src/alpha.ts',
      './src/Button.stories.tsx',
      './src/zulu.ts',
    ]);
  });

  it('keeps synthetic transit nodes in memory while omitting them from serialization', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const synthetic = 'virtual:bridge';
    const helper = '/repo/packages/ui/src/helper.ts';
    const { input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { [story]: 'S', [helper]: 'H' },
    });
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: synthetic, reasons: [{ moduleName: story }] },
        { id: 3, name: helper, reasons: [{ moduleName: synthetic }] },
      ],
    };

    const manifest = await buildManifest(stats, input);

    expect(manifest.files.get('./src/Button.stories.tsx')?.dependencies).toContain(synthetic);
    expect(manifest.files.get(synthetic)?.dependencies).toContain('./src/helper.ts');

    const serialized = serializeManifest(manifest);

    expect(serialized.files).not.toHaveProperty(synthetic);
    expect(serialized.files['./src/Button.stories.tsx'].dependencies).not.toContain(synthetic);
    expect(manifest.files.get('./src/Button.stories.tsx')?.dependencies).toContain(synthetic);
    expect(manifest.files.get(synthetic)?.dependencies).toContain('./src/helper.ts');
  });

  it('prunes dependency references to synthetic nodes after deriving hashes and attribution', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const synthetic = 'virtual:bridge';
    const helper = '/repo/packages/ui/src/helper.ts';
    const { disk, input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { [story]: 'S', [helper]: 'H1' },
    });
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: synthetic, reasons: [{ moduleName: story }] },
        { id: 3, name: helper, reasons: [{ moduleName: synthetic }] },
      ],
    };

    const before = serializeManifest(await buildManifest(stats, input));

    disk.fileHashes = { [story]: 'S', [helper]: 'H2' };
    const after = serializeManifest(await buildManifest(stats, input));

    for (const file of Object.values(before.files)) {
      expect(file.dependencies.every((dependency) => dependency in before.files)).toBe(true);
    }

    // The helper remains part of the complete pre-prune graph used for derived values even though
    // its synthetic bridge is absent from the serialized graph.
    expect(after.storyFiles['./src/Button.stories.tsx']).not.toBe(
      before.storyFiles['./src/Button.stories.tsx']
    );
    expect(after.storybookConfigHashes).toEqual(before.storybookConfigHashes);
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(before.attribution).toEqual({
      storyReachable: ['./src/Button.stories.tsx', './src/helper.ts'],
      previewSubtree: [],
      storybookGlobals: [],
    });
    expect(after.attribution).toEqual(before.attribution);
  });

  it('keeps a real file reachable only through a synthetic bridge as its own serialized entry', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const synthetic = 'virtual:bridge';
    const helper = '/repo/packages/ui/src/helper.ts';
    const { input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { [story]: 'S', [helper]: 'H' },
    });
    // The only path from the story to the helper runs through the synthetic bridge, which pruning
    // erases. The helper must still surface as its own entry so its hash is published for diffing;
    // its reachability is carried by the precomputed roll-ups, not by the serialized edges.
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: synthetic, reasons: [{ moduleName: story }] },
        { id: 3, name: helper, reasons: [{ moduleName: synthetic }] },
      ],
    };

    const serialized = serializeManifest(await buildManifest(stats, input));

    // The helper is published with its own hash, so a debug reader can diff it...
    expect(serialized.files['./src/helper.ts'].hash).toBe('H');
    // ...even though no serialized dependency edge reaches it (the bridge that did was pruned).
    const reachedByAnEdge = Object.values(serialized.files).some((file) =>
      file.dependencies.includes('./src/helper.ts')
    );
    expect(reachedByAnEdge).toBe(false);
  });

  it('counts a synthetic node itself towards the roll-up of the story that reaches it', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const synthetic = 'virtual:bridge';
    const helper = '/repo/packages/ui/src/helper.ts';
    const { input } = createFixture({
      isAbsent: syntheticAbsent,
      fileHashes: { [story]: 'S', [helper]: 'H' },
    });

    // The same two real files with the same bytes, once with a synthetic leaf hanging off the story
    // and once without. The leaf has no file, so pruning erases it and both serialized graphs come
    // out identical — but it was a member of the story's subtree when the roll-up ran, so it moved
    // the hash. Pruning any earlier would collapse these two manifests onto the same story hash.
    const withLeaf: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: helper, reasons: [{ moduleName: story }] },
        { id: 3, name: synthetic, reasons: [{ moduleName: story }] },
      ],
    };
    const withoutLeaf: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: helper, reasons: [{ moduleName: story }] },
      ],
    };

    const bridged = serializeManifest(await buildManifest(withLeaf, input));
    const plain = serializeManifest(await buildManifest(withoutLeaf, input));

    // Identical after pruning, so the story hash is the only place the leaf can show up.
    expect(bridged.files).toEqual(plain.files);
    const key = './src/Button.stories.tsx';
    expect(bridged.storyFiles[key]).not.toBe(plain.storyFiles[key]);
  });
});

describe('getManifestPath', () => {
  it('places the manifest in the internal directory of the Storybook build', () => {
    expect(getManifestPath('/repo/packages/ui/storybook-static')).toBe(
      '/repo/packages/ui/storybook-static/.chromatic/turbosnap-manifest.json'
    );
  });
});

describe('writeManifest', () => {
  const manifestPath = '/repo/packages/ui/storybook-static/.chromatic/turbosnap-manifest.json';

  it('writes the serialized manifest as JSON to turbosnap-manifest.json in the output directory', async () => {
    const { disk, input } = createFixture();
    const manifest = await manifestWithPreview('preview.ts');

    writeManifest(manifest, manifestPath, input.projectFiles);

    expect(disk.writtenFiles?.[manifestPath]).toBe(JSON.stringify(serializeManifest(manifest)));
  });

  it('writes a payload that round-trips through JSON.parse', async () => {
    const { disk, input } = createFixture();
    // The file is uploaded to S3 and read back for debugging, so it has to be valid JSON with the
    // Maps and Sets already flattened.
    writeManifest(await manifestWithPreview('preview.ts'), manifestPath, input.projectFiles);

    const payload = disk.writtenFiles?.[manifestPath] ?? '';

    expect(JSON.parse(payload).storybookConfigHashes.preview).toEqual(expect.any(String));
  });
});
