/* eslint-disable max-lines */
import { describe, expect, it } from 'vitest';

import { FileHash, FilePath, TurboSnapFile } from './graph';
import { STORYBOOK_GLOBALS_KEY, STORYBOOK_PREVIEW_KEY } from './storybookFileKeys';
import { collectStorybookFiles } from './storybookFiles';

// The config dir most tests don't care about; only the configDir-specific tests below vary it.
const DEFAULT_CONFIG_DIR = './.storybook';

// Most tests exercise the fallback for graphs without a detected composition root. Tests that need
// a composition root pass one explicitly in the final suite.
const NO_GLOBAL_ROOTS = new Set<FilePath>();

// An identity "hash" so a roll-up is readable as the set of paths that went into it, which is what
// makes the contents of the shared `preview` roll-up visible.
function identity(input: string): string {
  return input;
}

function makeFiles(graph: Record<FilePath, FilePath[]>): Map<FilePath, TurboSnapFile> {
  return new Map(
    Object.entries(graph).map(([filePath, dependencies]) => [
      filePath,
      { hash: `hash-${filePath}`, dependencies: new Set(dependencies) },
    ])
  );
}

function makeHashes(filePaths: FilePath[]): Map<FilePath, FileHash> {
  return new Map(filePaths.map((filePath) => [filePath, `hash-${filePath}`]));
}

// The story files of a graph, standing in for the set the caller reads from the stats file.
function storiesIn(files: Map<FilePath, TurboSnapFile>): Set<FilePath> {
  return new Set([...files.keys()].filter((filePath) => filePath.includes('.stories.')));
}

describe('collectStorybookFiles', () => {
  it('keys the preview subtree under the `preview` category', () => {
    const files = makeFiles({ './.storybook/preview.ts': [], './src/a.stories.tsx': [] });
    const hashes = makeHashes(['./.storybook/preview.ts', './src/a.stories.tsx']);

    const { storybookConfigHashes } = collectStorybookFiles(
      files,
      hashes,
      { reachable: new Set(['./src/a.stories.tsx']), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toContain(STORYBOOK_PREVIEW_KEY);
    expect([...storybookConfigHashes.keys()]).not.toContain('./.storybook/preview.ts');
  });

  it('matches every preview config extension Storybook accepts', () => {
    const previews = [
      './.storybook/preview.ts',
      './.storybook/preview.tsx',
      './.storybook/preview.js',
      './.storybook/preview.jsx',
      './.storybook/preview.mjs',
      './.storybook/preview.cjs',
    ];
    const { storybookConfigHashes, attribution } = collectStorybookFiles(
      makeFiles(Object.fromEntries(previews.map((p) => [p, []]))),
      makeHashes(previews),
      { reachable: new Set(), storyFiles: new Set() },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    // Every extension lands in the one shared `preview` home, so all six show up in its subtree.
    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_PREVIEW_KEY]);
    expect([...attribution.previewSubtree].sort()).toEqual([...previews].sort());
  });

  it('does not treat a file merely named preview outside the config dir as a config', () => {
    const files = makeFiles({ './src/preview.ts': [] });

    const { storybookConfigHashes, attribution } = collectStorybookFiles(
      files,
      makeHashes(['./src/preview.ts']),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_GLOBALS_KEY]);
    expect([...attribution.storybookGlobals]).toEqual(['./src/preview.ts']);
  });

  it('does not treat a preview config under node_modules as the project preview', () => {
    const vendoredPreview = './node_modules/some-addon/.storybook/preview.ts';
    const vendoredTheme = './node_modules/some-addon/.storybook/theme.ts';
    const files = makeFiles({ [vendoredPreview]: [vendoredTheme], [vendoredTheme]: [] });

    const { storybookConfigHashes, attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_GLOBALS_KEY]);
    expect([...attribution.previewSubtree]).toEqual([]);
    expect([...attribution.storybookGlobals].sort()).toEqual(
      [vendoredPreview, vendoredTheme].sort()
    );
  });

  it('finds the preview under a non-default config dir', () => {
    // A project with `-c src` has no `.storybook` at all; the preview lives at `./src/preview.ts` and
    // must be found there, not missed for not being literally named `.storybook`.
    const files = makeFiles({ './src/preview.ts': [] });

    const { storybookConfigHashes, attribution } = collectStorybookFiles(
      files,
      makeHashes(['./src/preview.ts']),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      './src',
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_PREVIEW_KEY]);
    expect([...attribution.previewSubtree]).toEqual(['./src/preview.ts']);
  });

  it('rolls a file the preview and one story both import into the preview subtree, not just the story', () => {
    // Reproduces the audit's synthetic repro: a theme shared between the preview and Button.stories,
    // under a non-default config dir. Missing this would make the theme storyReachable only, so
    // editing it moves Button's hash but not the preview's, and Badge (which never imports it) is
    // never recaptured despite the preview affecting every story.
    const shared = './src/theme.ts';
    const files = makeFiles({
      './config/preview.ts': [shared],
      [shared]: [],
      './src/Button.stories.tsx': [shared],
      './src/Badge.stories.tsx': [],
    });
    const hashes = makeHashes([...files.keys()]);

    const { attribution } = collectStorybookFiles(
      files,
      hashes,
      {
        reachable: new Set(['./src/Button.stories.tsx', './src/Badge.stories.tsx', shared]),
        storyFiles: storiesIn(files),
      },
      './config',
      NO_GLOBAL_ROOTS,
      identity
    );

    expect(attribution.previewSubtree.has(shared)).toBe(true);
    expect(attribution.storyReachable.has(shared)).toBe(true);
  });

  it('unions every preview subtree into the one `preview` roll-up', () => {
    // The `preview` entry covers all preview configs together, so both subtrees feed the single
    // rolled-up hash and a change to either moves it.
    const files = makeFiles({
      './.storybook/preview.ts': ['./.storybook/themeA.ts'],
      './.storybook/themeA.ts': [],
      './.storybook/preview.js': ['./.storybook/themeB.ts'],
      './.storybook/themeB.ts': [],
    });
    const hashes = makeHashes([...files.keys()]);

    const { storybookConfigHashes } = collectStorybookFiles(
      files,
      hashes,
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_PREVIEW_KEY]);
    // The identity hash makes the roll-up read as the paths that went into it: both themes are there.
    expect(storybookConfigHashes.get(STORYBOOK_PREVIEW_KEY)).toContain('themeA');
    expect(storybookConfigHashes.get(STORYBOOK_PREVIEW_KEY)).toContain('themeB');
  });

  it('rolls files reached by no story and no preview into globals', () => {
    const files = makeFiles({ './node_modules/react-dom/index.js': [] });

    const { storybookConfigHashes, attribution } = collectStorybookFiles(
      files,
      makeHashes(['./node_modules/react-dom/index.js']),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([STORYBOOK_GLOBALS_KEY]);
    expect([...attribution.storybookGlobals]).toEqual(['./node_modules/react-dom/index.js']);
  });

  it('omits the globals entry entirely when every file has a home', () => {
    const files = makeFiles({
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': [],
    });

    const { storybookConfigHashes } = collectStorybookFiles(
      files,
      makeHashes(['./src/a.stories.tsx', './src/button.tsx']),
      {
        reachable: new Set(['./src/a.stories.tsx', './src/button.tsx']),
        storyFiles: storiesIn(files),
      },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([]);
  });

  it('rolls a file hashed but absent from the graph into globals', () => {
    // A file inside a concatenated module is hashed but recorded only under the concatenation root,
    // so seeding globals from `files` rather than `hashes` would leave it hashed nowhere.
    const { attribution } = collectStorybookFiles(
      makeFiles({}),
      makeHashes(['./src/inlined.ts']),
      { reachable: new Set(), storyFiles: new Set() },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storybookGlobals]).toEqual(['./src/inlined.ts']);
  });

  it('partitions every hashed file into at least one home', () => {
    const files = makeFiles({
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': [],
      './.storybook/preview.ts': ['./.storybook/theme.ts'],
      './.storybook/theme.ts': [],
      './node_modules/react-dom/index.js': [],
    });
    const hashes = makeHashes([...files.keys()]);

    const { attribution } = collectStorybookFiles(
      files,
      hashes,
      {
        reachable: new Set(['./src/a.stories.tsx', './src/button.tsx']),
        storyFiles: storiesIn(files),
      },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    const homed = new Set([
      ...attribution.storyReachable,
      ...attribution.previewSubtree,
      ...attribution.storybookGlobals,
    ]);
    expect([...homed].sort()).toEqual([...hashes.keys()].sort());
  });

  it('reports a file in both a story subtree and a preview subtree under both homes', () => {
    // The two named homes are not mutually exclusive; only the globals seed is defined by absence.
    const shared = './src/tokens.ts';
    const files = makeFiles({
      './src/a.stories.tsx': [shared],
      './.storybook/preview.ts': [shared],
      [shared]: [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: new Set(['./src/a.stories.tsx', shared]), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect(attribution.storyReachable.has(shared)).toBe(true);
    expect(attribution.previewSubtree.has(shared)).toBe(true);
    expect(attribution.storybookGlobals.has(shared)).toBe(false);
  });

  it('leaves synthetic nodes out of the attribution, since they are never hashed', () => {
    // The walks pass through globs, externals and virtual modules; only real files are reported.
    const files = makeFiles({
      './src/a.stories.tsx': ['virtual:stories'],
      'virtual:stories': [],
      './.storybook/preview.ts': ['glob:./src/**'],
      'glob:./src/**': [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes(['./src/a.stories.tsx', './.storybook/preview.ts']),
      {
        reachable: new Set(['./src/a.stories.tsx', 'virtual:stories']),
        storyFiles: storiesIn(files),
      },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storyReachable]).toEqual(['./src/a.stories.tsx']);
    expect([...attribution.previewSubtree]).toEqual(['./.storybook/preview.ts']);
  });

  it('skips a preview config that has no content hash', () => {
    const files = makeFiles({ './.storybook/preview.ts': [] });

    const { storybookConfigHashes } = collectStorybookFiles(
      files,
      new Map(),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...storybookConfigHashes.keys()]).toEqual([]);
  });

  it('keeps a file both a story-reachable and a storybookGlobals file import in globals', () => {
    const entryPreview = './node_modules/@storybook/react/dist/entry-preview.js';
    const react = './node_modules/react/index.js';
    const files = makeFiles({
      './src/a.stories.tsx': [react],
      [entryPreview]: [react],
      [react]: [],
    });
    const storyReachable = new Set(['./src/a.stories.tsx', react]);

    const before = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: storyReachable, storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    const changedHashes = makeHashes([...files.keys()]);
    changedHashes.set(react, 'hash-react-v2');
    const after = collectStorybookFiles(
      files,
      changedHashes,
      { reachable: storyReachable, storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect(before.attribution.storyReachable.has(react)).toBe(true);
    expect(before.attribution.storybookGlobals.has(react)).toBe(true);
    expect(after.storybookConfigHashes.get(STORYBOOK_GLOBALS_KEY)).not.toBe(
      before.storybookConfigHashes.get(STORYBOOK_GLOBALS_KEY)
    );
  });

  it('stops the globals walk at story files', () => {
    // The config entry reaches the stories glob, which reaches every story. Following that edge would
    // put every component into globals and make every change a whole-Storybook change.
    const files = makeFiles({
      './node_modules/@storybook/core/entry.js': ['glob:./src/**/*.stories.tsx'],
      'glob:./src/**/*.stories.tsx': ['./src/a.stories.tsx'],
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': [],
    });
    const hashes = makeHashes([
      './node_modules/@storybook/core/entry.js',
      './src/a.stories.tsx',
      './src/button.tsx',
    ]);

    const { attribution } = collectStorybookFiles(
      files,
      hashes,
      {
        reachable: new Set(['./src/a.stories.tsx', './src/button.tsx']),
        storyFiles: storiesIn(files),
      },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storybookGlobals]).toEqual(['./node_modules/@storybook/core/entry.js']);
  });

  it('pulls a project component into globals when a global reaches it off the story path', () => {
    // A decorator in the config dir imports Button directly. Button is story-reachable as well, but
    // the globals walk stops only at story files, so the non-story edge still makes Button a global:
    // the decorator wraps every story, so a Button change has to retest all of them.
    const button = './src/button.tsx';
    const decorators = './.storybook/decorators.ts';
    const files = makeFiles({
      './node_modules/@storybook/core/entry.js': [decorators],
      [decorators]: [button],
      './src/a.stories.tsx': [button],
      [button]: [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: new Set(['./src/a.stories.tsx', button]), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect(attribution.storyReachable.has(button)).toBe(true);
    expect(attribution.storybookGlobals.has(button)).toBe(true);
    // The story file itself is never a seed and is never walked into, so it stays out.
    expect(attribution.storybookGlobals.has('./src/a.stories.tsx')).toBe(false);
  });

  it('leaves the preview subtree to its own roll-up when the globals closure reaches it', () => {
    // The globals walk reaches the preview through Storybook's core entry. Preview files are removed
    // from globals because the separate `preview` roll-up already tracks them.
    const files = makeFiles({
      './node_modules/@storybook/core/entry.js': ['./.storybook/preview.ts'],
      './.storybook/preview.ts': ['./.storybook/theme.ts'],
      './.storybook/theme.ts': [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: new Set(), storyFiles: storiesIn(files) },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storybookGlobals]).toEqual(['./node_modules/@storybook/core/entry.js']);
    expect([...attribution.previewSubtree].sort()).toEqual([
      './.storybook/preview.ts',
      './.storybook/theme.ts',
    ]);
  });

  it('terminates on an import cycle among globals', () => {
    // Bundler graphs have cycles. The shared walk's visited set is what stops this one.
    const files = makeFiles({
      './node_modules/a/index.js': ['./node_modules/b/index.js'],
      './node_modules/b/index.js': ['./node_modules/a/index.js'],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      { reachable: new Set(), storyFiles: new Set() },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storybookGlobals].sort()).toEqual([
      './node_modules/a/index.js',
      './node_modules/b/index.js',
    ]);
  });

  it('leaves a file only stories reach out of globals', () => {
    const files = makeFiles({
      './src/a.stories.tsx': ['./src/button.tsx'],
      './src/button.tsx': ['./node_modules/lodash/index.js'],
      './node_modules/lodash/index.js': [],
      './node_modules/react-dom/index.js': [],
    });

    const { attribution } = collectStorybookFiles(
      files,
      makeHashes([...files.keys()]),
      {
        reachable: new Set([
          './src/a.stories.tsx',
          './src/button.tsx',
          './node_modules/lodash/index.js',
        ]),
        storyFiles: storiesIn(files),
      },
      DEFAULT_CONFIG_DIR,
      NO_GLOBAL_ROOTS,
      identity
    );

    expect([...attribution.storybookGlobals]).toEqual(['./node_modules/react-dom/index.js']);
  });
});

describe('collectStorybookFiles with a detected global composition root', () => {
  // `configEntry` represents a builder-generated module that loads global preview annotations. It is
  // synthetic, so it has no content hash and must be passed as an explicit traversal root. The story
  // also imports one annotation, which verifies that a file can be both global and story-reachable.
  const configEntry = './storybook-config-entry.js';
  const annotation = './local-addon/preview.js';
  const runtime = './local-addon/runtime.js';
  const story = './src/a.stories.tsx';
  const storyOnlyHelper = './src/format.ts';

  const graph = {
    [configEntry]: [annotation, './.storybook/preview.ts'],
    [annotation]: [runtime],
    [runtime]: [],
    [story]: [annotation, storyOnlyHelper],
    [storyOnlyHelper]: [],
    './.storybook/preview.ts': [],
  };

  // Only real files have hashes; the synthetic composition root does not.
  const realFiles = [annotation, runtime, story, storyOnlyHelper, './.storybook/preview.ts'];

  function collect() {
    const files = makeFiles(graph);
    return collectStorybookFiles(
      files,
      makeHashes(realFiles),
      {
        reachable: new Set([story, annotation, runtime, storyOnlyHelper]),
        storyFiles: new Set([story]),
      },
      DEFAULT_CONFIG_DIR,
      new Set([configEntry]),
      identity
    );
  }

  it('keeps an annotation and its runtime global although a story reaches them too', () => {
    const { attribution } = collect();

    expect(attribution.storybookGlobals.has(annotation)).toBe(true);
    expect(attribution.storybookGlobals.has(runtime)).toBe(true);
    expect(attribution.storyReachable.has(annotation)).toBe(true);
    expect(attribution.storyReachable.has(runtime)).toBe(true);
  });

  it('leaves a helper only the story imports out of globals', () => {
    const { attribution } = collect();

    expect(attribution.storybookGlobals.has(storyOnlyHelper)).toBe(false);
    expect(attribution.storyReachable.has(storyOnlyHelper)).toBe(true);
  });

  it('leaves the preview the root reaches in the preview set alone', () => {
    const { attribution } = collect();

    expect(attribution.previewSubtree.has('./.storybook/preview.ts')).toBe(true);
    expect(attribution.storybookGlobals.has('./.storybook/preview.ts')).toBe(false);
  });

  it.each(['storyReachable', 'previewSubtree', 'storybookGlobals'] as const)(
    'reports no synthetic node in %s',
    (setName) => {
      const { attribution } = collect();

      expect([...attribution[setName]]).not.toContain(configEntry);
    }
  );
});
