import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  disk,
  manifestWithPreview,
  outOfGraph,
  projectRoot,
  resetDisk,
  withSyntheticAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, countNodeModulesFiles, serializeManifest, writeManifest } from './manifest';

beforeEach(resetDisk);

describe('serializeManifest', () => {
  it('converts the manifest maps and sets into JSON-safe objects and arrays', async () => {
    disk.current.fileHashes = {
      '/repo/packages/ui/src/Button.stories.tsx': 'S',
      '/repo/packages/ui/src/helper.ts': 'H',
    };
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

    const manifest = await buildManifest(stats, projectRoot, outOfGraph);
    const serialized = serializeManifest(manifest);

    // JSON-safe: storyFiles is a plain object, dependencies is an array.
    expect(serialized.storybookHash).toBe(manifest.storybookHash);
    expect(serialized.storyFiles).toEqual(Object.fromEntries(manifest.storyFileHashes));
    expect(serialized.files['./src/Button.stories.tsx'].dependencies).toEqual(['./src/helper.ts']);
    // structuredClone can hide fields that are not friendly to JSON.parse/JSON>stringify so we test the exact flow instead.
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('emits storybookFiles as a JSON-safe object', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const preview = '/repo/packages/ui/.storybook/preview.ts';
    disk.current.fileHashes = { [story]: 'S', [preview]: 'P' };
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      ],
    };

    const manifest = await buildManifest(stats, projectRoot, outOfGraph);
    const serialized = serializeManifest(manifest);

    expect(serialized.storybookFiles['./.storybook/preview.ts']).toBe(
      manifest.storybookFiles.get('./.storybook/preview.ts')
    );
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('prunes dependency references to synthetic nodes after deriving hashes and attribution', async () => {
    const story = '/repo/packages/ui/src/Button.stories.tsx';
    const synthetic = 'virtual:bridge';
    const helper = '/repo/packages/ui/src/helper.ts';
    const stats: Stats = {
      modules: [
        { id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: synthetic, reasons: [{ moduleName: story }] },
        { id: 3, name: helper, reasons: [{ moduleName: synthetic }] },
      ],
    };

    await withSyntheticAbsent(async () => {
      disk.current.fileHashes = { [story]: 'S', [helper]: 'H1' };
      const before = serializeManifest(await buildManifest(stats, projectRoot, outOfGraph));

      disk.current.fileHashes = { [story]: 'S', [helper]: 'H2' };
      const after = serializeManifest(await buildManifest(stats, projectRoot, outOfGraph));

      for (const file of Object.values(before.files)) {
        expect(file.dependencies.every((dependency) => dependency in before.files)).toBe(true);
      }

      // The helper remains part of the complete pre-prune graph used for derived values even though
      // its synthetic bridge is absent from the serialized graph.
      expect(after.storyFiles['./src/Button.stories.tsx']).not.toBe(
        before.storyFiles['./src/Button.stories.tsx']
      );
      expect(after.storybookFiles).toEqual(before.storybookFiles);
      expect(after.storybookHash).not.toBe(before.storybookHash);
      expect(before.attribution).toEqual({
        storyReachable: ['./src/Button.stories.tsx', './src/helper.ts'],
        previewSubtree: [],
        storybookGlobals: [],
      });
      expect(after.attribution).toEqual(before.attribution);
    });
  });
});

describe('countNodeModulesFiles', () => {
  it('counts zero for a first-party-only graph', () => {
    const stats: Stats = {
      modules: [
        { id: 1, name: './src/Button.stories.tsx' },
        { id: 2, name: './src/Button.tsx' },
        { id: 3, name: './.storybook/preview.ts' },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(0);
  });

  it('counts installed dependency files however the builder spells them', () => {
    const stats: Stats = {
      // One relative (Vite), one absolute (webpack), one via `nameForCondition` (rspack).
      modules: [
        { id: 1, name: './src/Button.tsx' },
        { id: 2, name: './../../node_modules/@storybook/react/dist/entry-preview.js' },
        { id: 3, name: '/repo/node_modules/storybook/dist/csf/index.js' },
        { id: 4, name: 'dependency group', nameForCondition: '/repo/node_modules/react/index.js' },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(3);
  });

  it('counts the concatenated children of a dependency group', () => {
    const stats: Stats = {
      modules: [
        {
          id: 1,
          name: './../../node_modules/storybook/dist/csf/index.js + 1 modules',
          modules: [
            { name: './../../node_modules/storybook/dist/csf/index.js' },
            { name: './../../node_modules/storybook/dist/csf/toId.js' },
          ],
        },
      ],
    };

    expect(countNodeModulesFiles(stats)).toBe(2);
  });
});

describe('writeManifest', () => {
  // Writing is not reading, so it stays a direct `fs` call rather than a method on the disk module.
  // These write into a real temporary directory and read the bytes back, which is what the Index
  // debugging flow does with the uploaded file.
  let outputDirectory: string;

  beforeEach(() => {
    outputDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-manifest-'));
  });

  afterEach(() => {
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it('writes the serialized manifest as JSON to turbosnap-manifest.json in the output directory', async () => {
    const manifest = await manifestWithPreview('preview.ts');

    writeManifest(manifest, outputDirectory);

    expect(readFileSync(path.join(outputDirectory, 'turbosnap-manifest.json'), 'utf8')).toBe(
      JSON.stringify(serializeManifest(manifest))
    );
  });

  it('writes a payload that round-trips through JSON.parse', async () => {
    // The file is uploaded to S3 and read back for debugging, so it has to be valid JSON with the
    // Maps and Sets already flattened.
    writeManifest(await manifestWithPreview('preview.ts'), outputDirectory);

    const payload = readFileSync(path.join(outputDirectory, 'turbosnap-manifest.json'), 'utf8');

    expect(JSON.parse(payload).storybookFiles['./.storybook/preview.ts']).toEqual(
      expect.any(String)
    );
  });
});
