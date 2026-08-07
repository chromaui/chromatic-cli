import { beforeEach, describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import {
  disk,
  outOfGraph,
  projectRoot,
  resetDisk,
  withAbsent,
} from './__fixtures__/manifestFixtures';
import { buildManifest, serializeManifest } from './manifest';

beforeEach(resetDisk);

describe('buildManifest storybookFiles', () => {
  // Two stories imported straight from the stories entry (Vite style). Button also imports moment,
  // a per-story dependency. The config entry imports `.storybook/preview.ts`, which imports a
  // helper — preview and its helper form the preview subtree that no story reaches.
  const buttonStory = '/repo/packages/ui/src/Button.stories.tsx';
  const headerStory = '/repo/packages/ui/src/Header.stories.tsx';
  const moment = '/repo/packages/ui/node_modules/moment/moment.js';
  const preview = '/repo/packages/ui/.storybook/preview.ts';
  const previewHelper = '/repo/packages/ui/.storybook/theme.ts';
  const configEntry = './storybook-config-entry.js';
  // An orphan global: Storybook wires the framework's preview annotations into the config entry
  // alongside preview.ts, so it is neither story-reachable nor in the preview subtree.
  const entryPreview = '/repo/packages/ui/node_modules/@storybook/react/dist/entry-preview.js';
  const reactDom = '/repo/packages/ui/node_modules/react-dom/index.js';

  const previewKey = './.storybook/preview.ts';
  const globalsKey = 'storybookGlobals';

  function makeStats(): Stats {
    return {
      modules: [
        { id: 1, name: buttonStory, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 2, name: headerStory, reasons: [{ moduleName: './storybook-stories.js' }] },
        { id: 3, name: moment, reasons: [{ moduleName: buttonStory }] },
        { id: 4, name: preview, reasons: [{ moduleName: configEntry }] },
        { id: 5, name: previewHelper, reasons: [{ moduleName: preview }] },
        { id: 6, name: entryPreview, reasons: [{ moduleName: configEntry }] },
        { id: 7, name: reactDom, reasons: [{ moduleName: entryPreview }] },
      ],
    };
  }

  const baseHashes = {
    [buttonStory]: 'S1',
    [headerStory]: 'S2',
    [moment]: 'M',
    [preview]: 'P',
    [previewHelper]: 'PT',
    [entryPreview]: 'EP',
    [reactDom]: 'RD',
  };

  it('keys an entry by the canonical preview config path', async () => {
    disk.current.fileHashes = { ...baseHashes };

    const manifest = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect([...manifest.storybookFiles.keys()]).toContain(previewKey);
  });

  it('rolls orphan globals into a single catch-all entry', async () => {
    disk.current.fileHashes = { ...baseHashes };

    const manifest = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect([...manifest.storybookFiles.keys()]).toContain(globalsKey);
  });

  it('changes the catch-all entry when an orphan global content changes', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    // reactDom is reached only via the framework's preview annotations, so it lands in the bucket.
    disk.current.fileHashes = { ...baseHashes, [reactDom]: 'RD2' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storybookFiles.get(globalsKey)).not.toBe(before.storybookFiles.get(globalsKey));
  });

  it('changes the storybook hash when the preview config changes, leaving story hashes pure', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    disk.current.fileHashes = { ...baseHashes, [preview]: 'P2' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
    // Pure per-story hashes: a config change must not perturb any individual story's hash. The
    // backend notices it via storybookHash and drills into storybookFiles instead.
    expect([...after.storyFileHashes]).toEqual([...before.storyFileHashes]);
  });

  it('changes the storybook hash when an orphan global changes', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    disk.current.fileHashes = { ...baseHashes, [entryPreview]: 'EP2' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect([...after.storyFileHashes]).toEqual([...before.storyFileHashes]);
  });

  it('keeps a story dependency out of the catch-all, scoping the change to that story', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    // moment lives only in Button's subtree, so it is story-reachable and must not be bucketed.
    disk.current.fileHashes = { ...baseHashes, [moment]: 'M2' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storyFileHashes.get('./src/Button.stories.tsx')).not.toBe(
      before.storyFileHashes.get('./src/Button.stories.tsx')
    );
    expect(after.storyFileHashes.get('./src/Header.stories.tsx')).toBe(
      before.storyFileHashes.get('./src/Header.stories.tsx')
    );
    expect(after.storybookFiles.get(globalsKey)).toBe(before.storybookFiles.get(globalsKey));
  });

  it('attributes a preview-subtree change to the preview entry, not the catch-all', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    // theme.ts is reached only through preview.ts, so it belongs to the keyed preview entry. Landing
    // in both would double-count it and destroy the backend's attribution.
    disk.current.fileHashes = { ...baseHashes, [previewHelper]: 'PT2' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storybookFiles.get(previewKey)).not.toBe(before.storybookFiles.get(previewKey));
    expect(after.storybookFiles.get(globalsKey)).toBe(before.storybookFiles.get(globalsKey));
  });

  it('omits the preview entry when the graph has no preview config', async () => {
    // Real case: a Storybook project with no `.storybook/preview.*` in its graph at all.
    disk.current.fileHashes = { [buttonStory]: 'S1' };
    const manifest = await buildManifest(
      {
        modules: [
          { id: 1, name: buttonStory, reasons: [{ moduleName: './storybook-stories.js' }] },
        ],
      },
      projectRoot,
      outOfGraph
    );

    expect([...manifest.storybookFiles.keys()]).not.toContain(previewKey);
  });

  it('omits the catch-all entry when every global is synthetic', async () => {
    // The stories entry is the only non-story node here, and it has no file on disk, so there is
    // nothing real to bucket and no empty entry should appear.
    await withAbsent(
      (candidate) => candidate.includes('storybook-stories.js'),
      async () => {
        disk.current.fileHashes = { [buttonStory]: 'S1' };
        const manifest = await buildManifest(
          {
            modules: [
              { id: 1, name: buttonStory, reasons: [{ moduleName: './storybook-stories.js' }] },
            ],
          },
          projectRoot,
          outOfGraph
        );

        // The version entry is unconditional, so it is the only key left once the catch-all is gone.
        expect([...manifest.storybookFiles.keys()]).toEqual(['storybookVersion']);
      }
    );
  });

  it('records the installed Storybook version as its own entry, verbatim rather than hashed', async () => {
    // The value is deliberately legible: the preview core runtime is served outside the module graph
    // on webpack and rspack, so a version is the only signal of a Storybook upgrade there, and
    // keeping it readable means the manifest itself says which Storybook produced the build.
    disk.current.packageVersions = { storybook: '10.6.0-alpha.3' };
    disk.current.fileHashes = { ...baseHashes };

    const manifest = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(manifest.storybookFiles.get('storybookVersion')).toBe('10.6.0-alpha.3');
  });

  it('changes the storybookHash when only the Storybook version changes', async () => {
    // A Storybook upgrade that touches no graph file must still force a recapture, which is the
    // whole point of the entry: on webpack and rspack no file hash can see it.
    disk.current.fileHashes = { ...baseHashes };
    disk.current.packageVersions = { storybook: '9.1.19' };
    const before = await buildManifest(makeStats(), projectRoot, outOfGraph);

    disk.current.fileHashes = { ...baseHashes };
    disk.current.packageVersions = { storybook: '9.1.20' };
    const after = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
    // Only the Storybook-wide gate moves; no individual story subtree changed.
    expect([...after.storyFileHashes]).toEqual([...before.storyFileHashes]);
  });

  it('produces identical storybookFiles and storybook hash when building the same stats twice', async () => {
    disk.current.fileHashes = { ...baseHashes };
    const first = await buildManifest(makeStats(), projectRoot, outOfGraph);
    disk.current.fileHashes = { ...baseHashes };
    const second = await buildManifest(makeStats(), projectRoot, outOfGraph);

    expect([...second.storybookFiles]).toEqual([...first.storybookFiles]);
    expect(second.storybookHash).toBe(first.storybookHash);
  });
});

describe('buildManifest out-of-graph inputs', () => {
  const story = '/repo/packages/ui/src/Button.stories.tsx';
  const mainConfig = '/repo/packages/ui/.storybook/main.ts';
  const staticAsset = '/repo/packages/ui/.storybook/static/mockServiceWorker.js';

  const stats: Stats = {
    modules: [{ id: 1, name: story, reasons: [{ moduleName: './storybook-stories.js' }] }],
  };

  beforeEach(() => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['mockServiceWorker.js'],
    };
    disk.current.fileHashes = { [story]: 'S', [mainConfig]: 'M', [staticAsset]: 'A' };
  });

  it('emits a synthetic entry per out-of-graph section', async () => {
    const manifest = await buildManifest(stats, projectRoot, outOfGraph);

    expect([...manifest.storybookFiles.keys()]).toContain('storybookConfig');
    expect([...manifest.storybookFiles.keys()]).toContain('staticFiles');
  });

  it('moves the storybook hash when main.ts changes, leaving story hashes untouched', async () => {
    const before = await buildManifest(stats, projectRoot, outOfGraph);

    disk.current.fileHashes = { ...disk.current.fileHashes, [mainConfig]: 'M2' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    // This is the v1-parity regression the mechanism exists to close: v1 bails on any configDir
    // edit, while v2 previously produced a byte-identical manifest.
    expect(after.storybookHash).not.toBe(before.storybookHash);
    expect(after.storyFileHashes).toEqual(before.storyFileHashes);
  });

  it('moves the storybook hash when a static asset changes', async () => {
    const before = await buildManifest(stats, projectRoot, outOfGraph);

    disk.current.fileHashes = { ...disk.current.fileHashes, [staticAsset]: 'A2' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('moves the storybook hash when a static asset is renamed without changing its bytes', async () => {
    const before = await buildManifest(stats, projectRoot, outOfGraph);

    // Static assets are served by URL, so the same bytes at a new path render differently. A
    // content-only roll-up left both `staticFiles` and the storybook hash byte-identical here.
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['sw.js'],
    };
    const renamed = '/repo/packages/ui/.storybook/static/sw.js';
    disk.current.fileHashes = { [story]: 'S', [mainConfig]: 'M', [renamed]: 'A' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('moves the storybook hash when two static assets swap contents', async () => {
    disk.current.directories = {
      '/repo/packages/ui/.storybook': ['main.ts', 'static'],
      '/repo/packages/ui/.storybook/static': ['a.png', 'b.png'],
    };
    const [a, b] = [
      '/repo/packages/ui/.storybook/static/a.png',
      '/repo/packages/ui/.storybook/static/b.png',
    ];
    disk.current.fileHashes = { [story]: 'S', [mainConfig]: 'M', [a]: 'A', [b]: 'B' };
    const before = await buildManifest(stats, projectRoot, outOfGraph);

    // The multiset of contents is unchanged, so only path-sensitive hashing sees this.
    disk.current.fileHashes = { [story]: 'S', [mainConfig]: 'M', [a]: 'B', [b]: 'A' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
  });

  it('keeps out-of-graph files out of files and attribution, so they miss the globals catch-all', async () => {
    const manifest = await buildManifest(stats, projectRoot, outOfGraph);

    // The catch-all is defined by absence from storyReachable/previewSubtree, which these satisfy by
    // construction — entering `files` would double-hash them into `storybookGlobals`.
    expect(manifest.files.has('./.storybook/main.ts')).toBe(false);
    expect(manifest.attribution.storybookGlobals.has('./.storybook/main.ts')).toBe(false);
    expect(
      manifest.attribution.storybookGlobals.has('./.storybook/static/mockServiceWorker.js')
    ).toBe(false);
  });

  it('serializes the per-file detail sections for the debug view', async () => {
    const serialized = serializeManifest(await buildManifest(stats, projectRoot, outOfGraph));

    expect(serialized.storybookConfigFiles).toEqual({ './.storybook/main.ts': 'M' });
    expect(serialized.staticFiles).toEqual({
      './.storybook/static/mockServiceWorker.js': 'A',
    });
    // eslint-disable-next-line unicorn/prefer-structured-clone
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it('covers a preview.* the builder elided, which has no graph-rolled entry at all', async () => {
    // marketing-ui's preview.ts is 0 lines, so vite emits no module for it: v2 had no entry and
    // missed where v1 bails. Hashing the config dir off disk closes that unconditionally.
    disk.current.directories = { '/repo/packages/ui/.storybook': ['main.ts', 'preview.ts'] };
    const preview = '/repo/packages/ui/.storybook/preview.ts';
    disk.current.fileHashes = { [story]: 'S', [mainConfig]: 'M', [preview]: 'P1' };
    const before = await buildManifest(stats, projectRoot, outOfGraph);
    expect(before.storybookFiles.has('./.storybook/preview.ts')).toBe(false);

    disk.current.fileHashes = { ...disk.current.fileHashes, [preview]: 'P2' };
    const after = await buildManifest(stats, projectRoot, outOfGraph);

    expect(after.storybookHash).not.toBe(before.storybookHash);
  });
});
