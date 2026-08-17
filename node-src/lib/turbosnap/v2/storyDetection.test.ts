import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import { detectStoryFiles } from './storyDetection';

const projectRoot = '/repo/packages/ui';

/**
 * Detects the story files in `stats`, treating exactly `realFiles` as having a file on disk. A
 * canonical path absent from that list is a synthetic node (a require-context glob, a generated
 * entry, an external).
 *
 * @param stats The stats file to parse.
 * @param realFiles The canonical paths that have a file on disk.
 *
 * @returns The detection result.
 */
function detect(stats: Stats, realFiles: string[]) {
  return detectStoryFiles(stats, {
    projectRoot,
    statsRoot: projectRoot,
    realFiles: new Set(realFiles),
  });
}

describe('detectStoryFiles through a require-context', () => {
  // Webpack/rspack don't import story files directly from the entry: the entry imports a lazy
  // require-context (a glob module that is not a real file), and that context imports the stories.
  const glob = './src/lib/ lazy namespace object';

  it('detects stories imported via a lazy require-context imported by the entry', () => {
    const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, reasons: [{ moduleName: glob }] },
        ],
      },
      ['./src/lib/Button.stories.tsx']
    );

    expect([...storyFiles]).toEqual(['./src/lib/Button.stories.tsx']);
  });

  it('detects an MDX story from the builder context without relying on a stories extension', () => {
    const mdxStory = '/repo/packages/ui/src/lib/Badge.stories.mdx';
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: mdxStory, reasons: [{ moduleName: glob }] },
        ],
      },
      ['./src/lib/Badge.stories.mdx']
    );

    expect([...storyFiles]).toEqual(['./src/lib/Badge.stories.mdx']);
  });

  it('does not treat the require-context glob itself as a story file', () => {
    const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, reasons: [{ moduleName: glob }] },
        ],
      },
      ['./src/lib/Button.stories.tsx']
    );

    expect([...storyFiles].some((key) => key.includes('lazy'))).toBe(false);
  });

  it('reports the relocated entry above a lazy story context when it is absent from the catalogue', () => {
    const relocatedEntry = './node_modules/.cache/storybook-next/storybook-stories.js';
    const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
    const { storyFiles, unrecognizedStoryEntries } = detect(
      {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: relocatedEntry }] },
          { id: 2, name: story, reasons: [{ moduleName: glob }] },
        ],
      },
      // The relocated entry is a real file in the build cache, so only its familiar basename can
      // give it away.
      ['./src/lib/Button.stories.tsx', relocatedEntry]
    );

    expect(storyFiles.size).toBe(0);
    expect(unrecognizedStoryEntries).toEqual([relocatedEntry]);
  });

  it('does not report an application file that owns an unrelated lazy context', () => {
    const applicationImporter = '/repo/packages/ui/src/loadExamples.ts';
    const importedFile = '/repo/packages/ui/src/examples/Button.tsx';
    const { unrecognizedStoryEntries } = detect(
      {
        modules: [
          { id: 1, name: applicationImporter },
          { id: 2, name: glob, reasons: [{ moduleName: applicationImporter }] },
          { id: 3, name: importedFile, reasons: [{ moduleName: glob }] },
        ],
      },
      ['./src/loadExamples.ts', './src/examples/Button.tsx']
    );

    expect(unrecognizedStoryEntries).toEqual([]);
  });
});

describe('detectStoryFiles through a config-entry require-context', () => {
  // rsbuild imports the require-context from the config entry (not storybook-stories.js), and the
  // stories themselves are concatenated modules.
  const glob = './src/lib|lazy|namespace object';
  const configEntry = './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js';
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  const stats: Stats = {
    modules: [
      { id: 1, name: glob, reasons: [{ moduleName: `${configEntry} + 1 modules` }] },
      {
        id: 2,
        name: `${story} + 1 modules`,
        modules: [{ name: story }, { name: impl }],
        reasons: [{ moduleName: glob }],
      },
      // A real file the config entry imports directly (like `.storybook/preview.ts`); it must not
      // be mistaken for a story just because the config entry imports it.
      {
        id: 3,
        name: '/repo/packages/ui/.storybook/preview.ts',
        reasons: [{ moduleName: `${configEntry} + 1 modules` }],
      },
    ],
  };

  const realFiles = [
    './src/lib/Button.stories.tsx',
    './src/lib/Button.tsx',
    './.storybook/preview.ts',
  ];

  it('detects a concatenated story imported via a context imported by the config entry', () => {
    expect([...detect(stats, realFiles).storyFiles]).toEqual(['./src/lib/Button.stories.tsx']);
  });

  it('does not treat a real file imported directly by the config entry as a story', () => {
    expect([...detect(stats, realFiles).storyFiles]).not.toContain('./.storybook/preview.ts');
  });
});

describe('detectStoryFiles when the builder omits the `./` prefix', () => {
  // storybook-builder-rsbuild 3.x ships `withChromaticMinimalContract`, which re-derives module names
  // via `path.relative(cwd, …)` — that never emits a `./` prefix. So the same graph carries both
  // spellings: the config entry is named `./storybook-config-entry.js` but referenced as
  // `storybook-config-entry.js`, and the require-context is named bare. Comparing the entry allowlist
  // against the raw spelling matched nothing and every build bailed `noStoryFiles`.
  const configEntry = 'storybook-config-entry.js';
  const glob = String.raw`src/lib|lazy|/^\.\/.*$/|namespace object`;
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const impl = '/repo/packages/ui/src/lib/Button.tsx';

  it('detects the story behind a bare-named context imported by a bare-named entry', () => {
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: glob, reasons: [{ moduleName: configEntry }] },
          { id: 2, name: story, reasons: [{ moduleName: glob }] },
          { id: 3, name: impl, reasons: [{ moduleName: story }] },
          // Storybook's preview runtime globals. The config entry imports them and they have no file
          // on disk, which is exactly the shape of a require-context — but an external imports
          // nothing, so it must never become a story importer.
          {
            id: 4,
            name: 'external "__STORYBOOK_MODULE_PREVIEW_API__"',
            reasons: [{ moduleName: configEntry }],
          },
        ],
      },
      ['./src/lib/Button.stories.tsx', './src/lib/Button.tsx']
    );

    expect([...storyFiles]).toEqual(['./src/lib/Button.stories.tsx']);
  });
});

describe('detectStoryFiles of swept node_modules stories', () => {
  // On storybook-builder-rsbuild 1.x–3.3.x, a stories glob whose directory prefix is not
  // slash-bounded lets rspack's require-context sweep a dependency's story into the graph: core
  // prepends `(?!.*node_modules)` but strips the `^`, so the unanchored guard matches after the
  // `node_modules` segment. Storybook's indexer applies `ignore: ["**/node_modules/**"]` to the same
  // glob, so the swept story is absent from `index.json` and its key can never be matched.
  const sweepingGlob = String.raw`..|lazy|/^\.\/.*$/|include: /(?!.*node_modules)…/|namespace object`;
  const story = '/repo/packages/ui/src/lib/Button.stories.tsx';
  const swept = '/repo/packages/ui/node_modules/fake-dep/Widget.stories.tsx';
  const shared = '/repo/packages/ui/node_modules/react-dom/index.js';

  it('does not treat a swept node_modules story as a story file', () => {
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: sweepingGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: story, reasons: [{ moduleName: sweepingGlob }] },
          { id: 3, name: swept, reasons: [{ moduleName: sweepingGlob }] },
          { id: 4, name: shared, reasons: [{ moduleName: swept }] },
        ],
      },
      [
        './src/lib/Button.stories.tsx',
        './node_modules/fake-dep/Widget.stories.tsx',
        './node_modules/react-dom/index.js',
      ]
    );

    expect([...storyFiles]).toEqual(['./src/lib/Button.stories.tsx']);
  });

  it('keeps a node_modules story a deliberate node_modules glob asked for', () => {
    // A glob naming `node_modules` (e.g. `../node_modules/@myorg/ui/**/*.stories.js`) is indexed by
    // core — `commonGlobOptions` applies no ignore — and the builder emits the include regex raw,
    // with no lookahead. The context is rooted in `node_modules`, so the sweep is intentional and
    // the story key is real and matchable.
    const deliberateGlob = String.raw`./node_modules/@myorg/ui|lazy|/^\.\/.*$/|namespace object`;
    const shipped = '/repo/packages/ui/node_modules/@myorg/ui/Button.stories.js';
    const { storyFiles } = detect(
      {
        modules: [
          { id: 1, name: deliberateGlob, reasons: [{ moduleName: './storybook-stories.js' }] },
          { id: 2, name: shipped, reasons: [{ moduleName: deliberateGlob }] },
        ],
      },
      ['./node_modules/@myorg/ui/Button.stories.js']
    );

    expect([...storyFiles]).toEqual(['./node_modules/@myorg/ui/Button.stories.js']);
  });

  it('keeps a node_modules story imported directly by the stories entry', () => {
    // Vite has no require-context: `storybook-stories.js` imports the matched files directly, and
    // that list comes from the same glob resolution the indexer uses. So a node_modules story there
    // is deliberate by construction and must survive.
    const shipped = '/repo/packages/ui/node_modules/@myorg/ui/Button.stories.js';
    const { storyFiles } = detect(
      { modules: [{ id: 1, name: shipped, reasons: [{ moduleName: './storybook-stories.js' }] }] },
      ['./node_modules/@myorg/ui/Button.stories.js']
    );

    expect([...storyFiles]).toEqual(['./node_modules/@myorg/ui/Button.stories.js']);
  });
});
