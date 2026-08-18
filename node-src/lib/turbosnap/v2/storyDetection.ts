import { AbsolutePath, Stats } from '../../../types';
import { FilePath } from './graph';
import { canonicalImporters, normalizeStatsPath, rootFilePath } from './paths';

/**
 * Whether a canonical path has a real file on disk. You can use things that adhere to this
 * interface such as `Map` or `Set`.
 */
export interface OnDiskFiles {
  has(filePath: FilePath): boolean;
}

/**
 * What story detection needs to resolve stats paths and tell real files apart from the
 * require-context glob.
 */
interface StoryDetectionContext {
  // The absolute Storybook project root that module paths anchor against.
  projectRoot: AbsolutePath;
  // The directory relative stats paths are named from.
  statsRoot: AbsolutePath;
  // Which canonical paths have a real file on disk.
  onDiskFiles: OnDiskFiles;
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

// Config entry files import the story require-context. They import non-story files too (e.g.
// `.storybook/preview.ts`), so they only help locate the context — they are not treated as direct
// story importers.
const CONFIG_ENTRY_FILES = new Set([
  './storybook-config-entry.js',
  './node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js',
  './node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js',
]);

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
 * Detects which modules in the stats are story files.
 *
 * @param context The context required for story detection. See {@link StoryDetectionContext}.
 * @param stats The stats file to parse.
 *
 * @returns The canonical paths of the story files.
 */
export function detectStoryFiles(context: StoryDetectionContext, stats: Stats): Set<FilePath> {
  const modules = processModules(context, stats);
  const { storyImporters, contextsExcludingNodeModules } = collectStoryImporters(context, modules);

  const storyFiles = new Set<FilePath>();
  for (const module of modules) {
    // Story files must live on disk
    if (!module.onDisk) {
      continue;
    }

    const matchedStoryImporters = module.importers.filter((importer) =>
      storyImporters.has(importer)
    );

    if (isStoryFile(module.filePath, matchedStoryImporters, contextsExcludingNodeModules)) {
      storyFiles.add(module.filePath);
    }
  }

  return storyFiles;
}

/**
 * A raw stats module after the per-module work every step needs: the canonical file path, whether it
 * has a file on disk, and its canonical importer names.
 */
interface ProcessedModule {
  // The raw stats module name, left un-normalized: `isLazyContext` and `excludesNodeModules` read
  // the literal ` lazy ` marker and the include-regex text, which normalization would destroy. Do
  // not key on it or treat it as a path — use `filePath` for that.
  rawName: string;
  // The module's canonical root file path (see {@link rootFilePath}). Also serves as its importer key.
  filePath: FilePath;
  // Whether `filePath` has a real file on disk.
  onDisk: boolean;
  // The canonical importer names, from the module reasons.
  importers: FilePath[];
}

/**
 * Walks the stats modules once and turns each into a {@link ProcessedModule}, so the heavy per-module
 * work (the canonical path and the canonical importer names) runs one time and both steps read the
 * same shape.
 *
 * A module is kept when it is not an external and has a non-null canonical file path. On-disk and
 * off-disk modules are both kept.
 *
 * @param context The context required for story detection. See {@link StoryDetectionContext}.
 * @param stats The stats file to parse.
 *
 * @returns The processed modules.
 */
function processModules(context: StoryDetectionContext, stats: Stats): ProcessedModule[] {
  const { projectRoot, statsRoot, onDiskFiles } = context;
  const processed: ProcessedModule[] = [];

  for (const module of stats.modules) {
    // An external has no on-disk file and imports nothing, so it can never be or import a story.
    if (EXTERNAL_MODULE.test(module.name)) {
      continue;
    }

    const filePath = rootFilePath(module, projectRoot, statsRoot);
    if (!filePath) {
      continue;
    }

    const importers = canonicalImporters(module, projectRoot, statsRoot);

    processed.push({
      rawName: module.name,
      filePath,
      onDisk: onDiskFiles.has(filePath),
      importers,
    });
  }

  return processed;
}

/**
 * Whether a module is a story file, given the story importers that claim it.
 *
 * A `node_modules` story claimed only by contexts that excluded `node_modules` is refused, because it
 * is unmatchable: the indexer ignored it, so it is absent from `index.json`.
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
  if (matchedStoryImporters.length === 0) {
    return false;
  }
  if (!NODE_MODULES_SEGMENT.test(filePath)) {
    return true;
  }
  return !matchedStoryImporters.every((importer) => contextsExcludingNodeModules.has(importer));
}

/**
 * Collects the module names a story file may be imported from. Vite imports stories straight from
 * the builder entry, but webpack/rspack wrap them in a lazy require-context: an entry (the stories
 * entry or the config entry) imports the context and the context imports the stories. Treat any
 * such context (a module imported by an entry file that isn't itself a real file) as a story
 * importer too, so both builders are covered.
 *
 * @param context The context required for story detection. See {@link StoryDetectionContext}.
 * @param modules The processed modules to scan (see {@link processModules}).
 *
 * @returns The set of canonical importer keys that indicate a story file.
 */
function collectStoryImporters(
  context: StoryDetectionContext,
  modules: ProcessedModule[]
): {
  storyImporters: Set<string>;
  contextsExcludingNodeModules: Set<string>;
} {
  const { projectRoot, statsRoot } = context;
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

  for (const module of modules) {
    // The require-context is off-disk; real files it imports are handled by the classify step.
    if (module.onDisk) {
      continue;
    }

    const importedByEntry = module.importers.some((importer) => entryFiles.has(importer));
    if (importedByEntry) {
      storyImporters.add(module.filePath);
      if (isLazyContext(module.rawName) && excludesNodeModules(module.rawName)) {
        contextsExcludingNodeModules.add(module.filePath);
      }
    }
  }

  return { storyImporters, contextsExcludingNodeModules };
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
 * Whether a lazy context's stories glob excludes `node_modules`. A glob that does not name
 * `node_modules` excludes it: Storybook's indexer then ignores `node_modules` and so does the
 * builder, so such a context should never yield a story from there.
 *
 * @param contextName The raw name of a lazy require-context.
 *
 * @returns Whether the context's glob excluded `node_modules`.
 */
function excludesNodeModules(contextName: string): boolean {
  return !NODE_MODULES_SEGMENT.test(contextName.split(LAZY_CONTEXT_MARKER)[0]);
}
