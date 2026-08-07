import path from 'path';

import { Stats } from '../../../types';
import { FilePath } from './graph';
import { moduleFileNames, normalizeStatsPath } from './paths';

/** Whether a canonical path has a real file on disk. A `Map` of hashes satisfies this. */
export interface RealFiles {
  has(filePath: FilePath): boolean;
}

// Generated entry points that import all story files. We use this to determine if a file is a story
// file because they may not always be *.stories.* files because it's configurable.
const STORIES_ENTRY_FILES = new Set([
  // v6 store (SB <= 6.3)
  './generated-stories-entry.js',
  // v6 store with .cjs extension (SB 6.5)
  './generated-stories-entry.cjs',
  // v7 store (SB >= 6.4)
  './storybook-stories.js',
  // vite builder
  '/virtual:/@storybook/builder-vite/storybook-stories.js',
  'virtual:@storybook/builder-vite/storybook-stories.js',
  // rspack builder
  './node_modules/.cache/storybook/default/dev-server/storybook-stories.js',
  './node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js',
]);

// Config entry files import the story require-context (see collectStoryImporters). They import
// non-story files too (e.g. `.storybook/preview.ts`), so they only help locate the context — they
// are not treated as direct story importers.
const CONFIG_ENTRY_FILES = new Set([
  './storybook-config-entry.js',
  './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js',
  './node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js',
]);

// Recognition still requires an exact canonical path. Basenames are diagnostic evidence only: a
// familiar generated name at an unfamiliar path is how an entry relocation presents in the stats.
const ENTRY_FILE_BASENAMES = new Set(
  [...STORIES_ENTRY_FILES, ...CONFIG_ENTRY_FILES].map((name) => path.posix.basename(name))
);

// Webpack/rspack name a module the bundle does not own `external "<request>"` (e.g. Storybook's
// preview runtime globals). It has no on-disk file and imports nothing.
const EXTERNAL_MODULE = /^external "/;

// A `node_modules` segment anywhere in a path. Matched segment-wise rather than by substring because
// a canonical key may reach a hoisted install through `../`, and because a context's own name embeds
// the literal text `node_modules` inside its include regex.
const NODE_MODULES_SEGMENT = /(^|\/)node_modules\//;

// Webpack spells contexts with ` lazy `; rspack delimits the same marker with pipes.
const LAZY_CONTEXT_MARKER = / lazy |\|lazy\|/;

/**
 * Which modules in the stats are story files, and — when none are — the entries that explain it.
 *
 * @param stats The stats file to parse.
 * @param context.projectRoot The absolute Storybook project root that module paths anchor against.
 * @param context.statsRoot The directory relative stats paths are named from.
 * @param context.realFiles Which canonical paths have a real file on disk, used to tell real files
 * apart from the require-context glob.
 *
 * @returns The canonical paths of the story files, and the unrecognized generated entries.
 */
export function detectStoryFiles(
  stats: Stats,
  context: { projectRoot: string; statsRoot: string; realFiles: RealFiles }
): { storyFiles: Set<FilePath>; unrecognizedStoryEntries: FilePath[] } {
  const { projectRoot, statsRoot, realFiles } = context;
  const { storyImporters, contextsExcludingNodeModules, unrecognizedStoryEntries } =
    collectStoryImporters(stats, projectRoot, realFiles, statsRoot);

  const storyFiles = new Set<FilePath>();
  for (const module of stats.modules) {
    const [sourceFilePath] = moduleFileNames(module).map((name) =>
      normalizeStatsPath(name, projectRoot, statsRoot)
    );
    if (!sourceFilePath) continue;

    // Importers hold the builder's own entry paths (e.g. `./storybook-stories.js`), canonicalised so
    // they compare against the canonical keys collectStoryImporters returns — the builder may spell
    // the same entry with or without a `./` prefix. Entry reasons carry a null moduleName, so drop
    // those.
    const matchedStoryImporters = (module.reasons ?? [])
      .map((reason) => reason.moduleName)
      .filter(Boolean)
      .map((name) => normalizeStatsPath(name, projectRoot, statsRoot))
      .filter((importer) => storyImporters.has(importer));

    // Only real files are story files; requiring a file on disk excludes the require-context glob
    // itself (which is imported by an entry but has no on-disk file).
    if (
      realFiles.has(sourceFilePath) &&
      isStoryFile(sourceFilePath, matchedStoryImporters, contextsExcludingNodeModules)
    ) {
      storyFiles.add(sourceFilePath);
    }
  }

  return { storyFiles, unrecognizedStoryEntries };
}

/**
 * Whether a module is a story file, given the story importers that claim it.
 *
 * A `node_modules` story claimed only by contexts that excluded `node_modules` is refused, because it
 * is unmatchable: the indexer ignored it, so it is absent from `index.json`. Rspack sweeps such a file
 * in anyway when the glob's directory prefix is not slash-bounded, because core's guard loses its `^`
 * and the regex engine matches past the segment; `storybook-builder-rsbuild` 3.4.0 closes that with
 * an explicit `webpackExclude`, and webpack's `RequireContextPlugin` never offered the candidates.
 *
 * Refusing it also protects the globals catch-all. Were it a story file, its subtree would become
 * story-reachable, so a shared runtime module (React DOM, the scheduler) would leave
 * `storybookGlobals` for a roll-up no story the Index knows about can carry — and a change to that
 * module would recapture nothing.
 *
 * A story a `node_modules` glob deliberately asked for survives, because its context did not exclude
 * `node_modules`. So does a story on Vite, where the stories entry imports the matched files directly
 * from the very list the indexer built, so no context claims it.
 *
 * @param filePath The module's canonical file path.
 * @param matchedStoryImporters The story importers that claim it.
 * @param contextsExcludingNodeModules Canonical keys of the lazy contexts whose glob excluded
 * `node_modules`; see {@link excludesNodeModules}.
 *
 * @returns Whether the module is a story file.
 */
function isStoryFile(
  filePath: FilePath,
  matchedStoryImporters: FilePath[],
  contextsExcludingNodeModules: Set<string>
): boolean {
  if (matchedStoryImporters.length === 0) return false;
  if (!NODE_MODULES_SEGMENT.test(filePath)) return true;
  return !matchedStoryImporters.every((importer) => contextsExcludingNodeModules.has(importer));
}

/**
 * Collects the module names a story file may be imported from. Vite imports stories straight from
 * the builder entry, but webpack/rspack wrap them in a lazy require-context: an entry (the stories
 * entry or the config entry) imports the context and the context imports the stories. Treat any
 * such context (a module imported by an entry file that isn't itself a real file) as a story
 * importer too, so both builders are covered.
 *
 * @param stats The stats file to parse.
 * @param projectRoot The absolute Storybook project root that module paths anchor against.
 * @param realFiles Which canonical paths have a real file on disk, used to tell real files apart
 * from the require-context glob.
 * @param statsRoot The directory relative stats paths are named from.
 *
 * @returns The set of canonical importer keys that indicate a story file.
 */
function collectStoryImporters(
  stats: Stats,
  projectRoot: string,
  realFiles: RealFiles,
  statsRoot: string
): {
  storyImporters: Set<string>;
  contextsExcludingNodeModules: Set<string>;
  unrecognizedStoryEntries: FilePath[];
} {
  const canonical = (name: string) => normalizeStatsPath(name, projectRoot, statsRoot);
  // The stories entry directly imports stories (Vite), so it is a story importer on its own; the
  // config entry only helps locate the require-context, so it is not. The catalogue holds raw builder
  // spellings, which anchor at the build's cwd (`statsRoot`), so both sides of the comparison
  // canonicalise the same way: rsbuild spells the same entry both `storybook-stories.js` and
  // `./storybook-stories.js`, and the raw spelling never matched.
  const entryFiles = new Set(
    [...STORIES_ENTRY_FILES, ...CONFIG_ENTRY_FILES].map((name) => canonical(name))
  );
  const storyImporters = new Set([...STORIES_ENTRY_FILES].map((name) => canonical(name)));
  const contextsExcludingNodeModules = new Set<string>();
  const unrecognizedStoryEntries = new Set<FilePath>();
  for (const module of stats.modules) {
    const [root] = moduleFileNames(module).map((name) => canonical(name));
    if (!module.name || !root || realFiles.has(root)) continue;
    // An external is a graph leaf, so it can never import a story. It has no on-disk file either,
    // which would otherwise let it through as a require-context.
    if (EXTERNAL_MODULE.test(module.name)) continue;
    const importers = (module.reasons ?? [])
      .map((reason) => reason.moduleName)
      .filter(Boolean)
      .map((name) => canonical(name));
    const importedByEntry = importers.some((importer) => entryFiles.has(importer));
    if (importedByEntry) {
      storyImporters.add(canonical(module.name));
      if (isLazyContext(module.name) && excludesNodeModules(module.name)) {
        contextsExcludingNodeModules.add(canonical(module.name));
      }
    } else {
      collectUnrecognizedStoryEntries(module.name, importers, realFiles, unrecognizedStoryEntries);
    }
  }
  return {
    storyImporters,
    contextsExcludingNodeModules,
    unrecognizedStoryEntries: [...unrecognizedStoryEntries],
  };
}

function collectUnrecognizedStoryEntries(
  moduleName: string,
  importers: FilePath[],
  realFiles: RealFiles,
  entries: Set<FilePath>
) {
  if (!isLazyContext(moduleName)) return;

  for (const importer of importers) {
    // A known basename catches the supported relocation workflow even when the generated entry is
    // a real cache file. A synthetic importer also qualifies because it cannot be an
    // application-owned lazy context; this preserves a loud failure if upstream renames a virtual
    // entry as well as moving it.
    if (ENTRY_FILE_BASENAMES.has(path.posix.basename(importer)) || !realFiles.has(importer)) {
      entries.add(importer);
    }
  }
}

/**
 * Whether a module name is a lazy require-context: the glob module a builder generates in place of
 * direct story imports. It is not a file on disk.
 *
 * @param moduleName The raw module name from the stats.
 *
 * @returns Whether the module is a lazy require-context.
 */
function isLazyContext(moduleName: string): boolean {
  return LAZY_CONTEXT_MARKER.test(moduleName);
}

/**
 * Whether a lazy context's stories glob did not name `node_modules`, which is the switch both halves
 * of Storybook read. The indexer applies `ignore: ["**\/node_modules/**"]` unless the glob names
 * `node_modules` (`commonGlobOptions`), and `storybook-builder-rsbuild` prepends a
 * `(?!.*node_modules)` guard under the same condition (`webpackIncludeRegexp`). So a context that
 * excludes `node_modules` should never yield a story from there.
 *
 * Read off the context's directory — its raw name up to the lazy marker — because the include regex
 * that follows contains the literal text `node_modules` in every clean build.
 *
 * @param contextName The raw name of a lazy require-context.
 *
 * @returns Whether the context's glob excluded `node_modules`.
 */
function excludesNodeModules(contextName: string): boolean {
  return !NODE_MODULES_SEGMENT.test(contextName.split(LAZY_CONTEXT_MARKER)[0]);
}
