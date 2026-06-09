import { createJiti } from 'jiti';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const QUERY = '?clack';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Editing a frame's task source or any of the renderer harness it pulls in should re-capture the
// frames in `storybook dev`. Frames load through jiti outside Vite's module graph, so Vite can't see
// the dependency; `handleHotUpdate` watches these directories and invalidates the frame modules.
const WATCHED_DIRECTORIES = [
  resolve(REPO_ROOT, 'node-src/ui/tasks'),
  resolve(REPO_ROOT, 'node-src/renderer'),
];

/**
 * Vite plugin that renders Storybook frame modules (`*.frames.ts`) in Node and exposes their output
 * as plain strings to the browser bundle.
 *
 * Frame modules import the real Clack renderer, which pulls in `node:*` builtins that cannot bundle
 * for the browser. The plugin claims `?clack` imports with `enforce: 'pre'` — before Vite follows
 * the import — runs the module through a Node-native loader (jiti, which transforms TypeScript and
 * resolves the `@cli/*` tsconfig paths), evaluates each export to its ANSI string, and emits an ESM
 * module of those strings. This keeps Clack and `node:*` out of the browser graph entirely.
 *
 * @returns The configured Vite plugin.
 */
export function clackCapture(): Plugin {
  return {
    name: 'clack-capture',
    enforce: 'pre',

    resolveId(source, importer) {
      if (!source.endsWith(QUERY)) return null;
      const modulePath = source.slice(0, -QUERY.length);
      const base = importer ? dirname(importer) : process.cwd();
      const resolved = resolveFrameModule(resolve(base, modulePath));
      if (resolved !== REPO_ROOT && !resolved.startsWith(REPO_ROOT + sep)) return null;
      return resolved + QUERY;
    },

    handleHotUpdate({ file, server, modules }) {
      if (!isWatchedHarnessFile(file)) return;

      const frameModules = [...server.moduleGraph.idToModuleMap.values()].filter((module) =>
        module.id?.endsWith(QUERY)
      );
      for (const module of frameModules) server.moduleGraph.invalidateModule(module);

      return [...modules, ...frameModules];
    },

    async load(id) {
      if (!id.endsWith(QUERY)) return null;
      const framePath = id.slice(0, -QUERY.length);

      // Fresh instance + disabled caches so edits re-run on every dev reload.
      const jiti = createJiti(import.meta.url, {
        tsconfigPaths: true,
        moduleCache: false,
        fsCache: false,
      });
      const frames = (await jiti.import(framePath)) as Record<string, unknown>;

      const rendered: Record<string, string> = {};
      for (const [name, value] of Object.entries(frames)) {
        if (name === 'default') continue;
        rendered[name] = typeof value === 'function' ? (value as () => string)() : (value as string);
      }

      // A default-export object (rather than named exports) lets the browser story import it with a
      // single typed default import — a wildcard `declare module '*?clack'` can't type per-file named
      // exports. See node-src/typings.d.ts.
      return `export default ${JSON.stringify(rendered)};`;
    },
  };
}

function isWatchedHarnessFile(file: string): boolean {
  return WATCHED_DIRECTORIES.some((dir) => file === dir || file.startsWith(dir + sep));
}

function resolveFrameModule(pathWithoutExtension: string): string {
  for (const extension of ['.ts', '.tsx', '.js', '.mjs']) {
    const candidate = pathWithoutExtension + extension;
    if (existsSync(candidate)) return candidate;
  }
  return pathWithoutExtension;
}
