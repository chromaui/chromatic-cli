import path from 'path';
import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { createFixture, projectRoot, syntheticAbsent } from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

const configDirectory = `${projectRoot}/.storybook`;
const preview = `${configDirectory}/preview.ts`;
const helper = `${configDirectory}/fixtures/data.json`;
const button = `${projectRoot}/src/Button.stories.tsx`;
const header = `${projectRoot}/src/Header.stories.tsx`;

function fixture() {
  return createFixture({
    directories: {
      [configDirectory]: [
        'main.ts',
        'preview.ts',
        'fixtures',
        'preview-head.html',
        'preview-body.html',
        'manager.ts',
        'tsconfig.json',
      ],
      [`${configDirectory}/fixtures`]: ['data.json'],
    },
    isAbsent: syntheticAbsent,
  });
}

function stats(importers: string[] = [button]): Stats {
  return {
    modules: [
      { id: 1, name: button, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 2, name: header, reasons: [{ moduleName: './storybook-stories.js' }] },
      { id: 3, name: preview, reasons: [{ moduleName: './storybook-config-entry.js' }] },
      { id: 4, name: helper, reasons: importers.map((moduleName) => ({ moduleName })) },
    ],
  };
}

describe('TurboSnap 2 configuration analysis', () => {
  it.each(['.', '..', './config'])(
    'recognizes entry files in a custom config directory: %s',
    async (directory) => {
      const root = path.resolve(projectRoot, directory);
      const { input } = createFixture({
        directories: {
          [root]: ['main.ts', 'preview.ts', 'preview-head.html', 'preview-body.html'],
        },
      });
      input.configDir = root;
      const manifest = await buildManifest({ modules: [] }, input);
      expect(manifest.configAnalysis.entryFiles).toEqual([
        ...manifest.outOfGraphFiles.storybookConfigFiles.keys(),
      ]);
      expect(manifest.configAnalysis.unattributedFiles).toEqual([]);
    }
  );

  it('identifies a story-scoped candidate without relaxing its existing global coverage', async () => {
    const { input, disk } = fixture();
    const before = await buildManifest(stats(), input);
    disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(stats(), input);

    expect(after.configAnalysis).toEqual({
      mode: 'directory',
      reason: 'output-evidence-unavailable',
      entryFiles: [
        './.storybook/main.ts',
        './.storybook/preview-body.html',
        './.storybook/preview-head.html',
        './.storybook/preview.ts',
      ],
      storyScopedCandidates: ['./.storybook/fixtures/data.json'],
      globalFiles: [],
      unattributedFiles: ['./.storybook/manager.ts', './.storybook/tsconfig.json'],
    });
    expect(after.storybookConfigHashes).not.toEqual(before.storybookConfigHashes);
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storyFileHashes.get('./src/Header.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Header.stories.tsx')
    );
  });

  it.each([{ importers: [preview] }, { importers: [preview, button] }])(
    'gives global attribution precedence for $importers',
    async ({ importers }) => {
      const { input } = fixture();
      const manifest = await buildManifest(stats(importers), input);
      expect(manifest.configAnalysis.globalFiles).toEqual(['./.storybook/fixtures/data.json']);
      expect(manifest.configAnalysis.storyScopedCandidates).toEqual([]);
    }
  );

  it.each([
    'main.ts',
    'preview.ts',
    'preview-head.html',
    'preview-body.html',
    'tsconfig.json',
    'manager.ts',
  ])(
    'keeps %s protected even when its build-time usage is absent from the preview graph',
    async (name) => {
      const { input, disk } = fixture();
      const before = await buildManifest(stats(), input);
      disk.fileHashes = { [`${configDirectory}/${name}`]: 'changed' };
      const after = await buildManifest(stats(), input);
      expect(after.storybookConfigHashes).not.toEqual(before.storybookConfigHashes);
    }
  );

  it('does not call a graph-absent helper unused', async () => {
    const { input, disk } = fixture();
    const noHelper = { modules: stats().modules.filter((module) => module.name !== helper) };
    const before = await buildManifest(noHelper, input);
    disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(noHelper, input);
    expect(after.configAnalysis.unattributedFiles).toContain('./.storybook/fixtures/data.json');
    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('preserves broad untraced exclusions and the existing main-config exception', async () => {
    const { input, disk } = fixture();
    input.untraced = ['packages/ui/.storybook/**'];
    const before = await buildManifest(stats(), input);
    disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(stats(), input);
    expect(after.storybookHash).toBe(before.storybookHash);
    expect(after.configAnalysis).toEqual({
      mode: 'directory',
      reason: 'output-evidence-unavailable',
      entryFiles: ['./.storybook/main.ts'],
      storyScopedCandidates: [],
      globalFiles: [],
      unattributedFiles: [],
    });
    expect(after.skippedFiles.get('./.storybook/fixtures/data.json')).toBe('untraced');

    input.untraced = [];
    const restored = await buildManifest(stats(), input);
    expect(restored.storybookHash).not.toBe(after.storybookHash);
    expect(restored.configAnalysis.storyScopedCandidates).toContain(
      './.storybook/fixtures/data.json'
    );
  });

  it('keeps explicit externals effective when a config file is also untraced', async () => {
    const { input, disk } = fixture();
    input.untraced = ['packages/ui/.storybook/**'];
    input.externals = ['packages/ui/.storybook/fixtures/**'];
    disk.trackedFiles = [helper];
    const before = await buildManifest(stats(), input);
    disk.fileHashes = { [helper]: 'changed' };
    const after = await buildManifest(stats(), input);
    expect(after.storybookConfigHashes.get('externals')).not.toBe(
      before.storybookConfigHashes.get('externals')
    );
    expect(after.configAnalysis.storyScopedCandidates).toEqual([]);
  });

  it.each(['static', 'external'])(
    'does not propose narrowing a story dependency with %s coverage',
    async (coverage) => {
      const { input, disk } = fixture();
      if (coverage === 'static') input.staticDirs = [`${configDirectory}/fixtures`];
      else {
        input.externals = ['packages/ui/.storybook/fixtures/**'];
        disk.trackedFiles = [helper];
      }
      const manifest = await buildManifest(stats(), input);
      expect(manifest.configAnalysis.globalFiles).toEqual(['./.storybook/fixtures/data.json']);
      expect(manifest.configAnalysis.storyScopedCandidates).toEqual([]);
    }
  );

  it('serializes the evidence separately from the uploaded hash categories', async () => {
    const { input } = fixture();
    const manifest = await buildManifest(stats(), input);
    const serialized = serializeManifest(manifest);
    expect(serialized.configAnalysis).toEqual(manifest.configAnalysis);
    expect(Object.keys(serialized.storybookConfigHashes)).not.toContain('configAnalysis');
  });
});
