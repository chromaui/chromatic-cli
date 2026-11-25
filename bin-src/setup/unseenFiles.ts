import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import getStorybookInfo from '../../node-src/lib/getStorybookInfo';
import { createLogger } from '../../node-src/lib/log';
import { isSyntheticFile } from '../../node-src/lib/turbosnap/v2/paths';
import { matchesFile } from '../../node-src/lib/utilities';
import type { StorybookInfoDeps } from '../../node-src/tasks/storybookInfo';
import type { Check } from './checks';
import { configFix, type DoctorInput } from './doctorInput';
import { forEachRepoFile, relativeOrDot } from './shared';

const STYLESHEET = /\.(?:css|scss|sass|less|styl|pcss)$/i;
const ASSET = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i;
const FILES_SHOWN = 10;

// One logger for every recheck: each createLogger adds a process listener.
let sharedLog: ReturnType<typeof createLogger> | undefined;
const silentLog = () => (sharedLog ??= createLogger({}, { logLevel: 'silent' }));

// Escapes what picomatch reads as glob syntax, so the path matches only itself.
const asGlob = (file: string) => file.replaceAll(/[*?[\]{}()!+@]/g, String.raw`\$&`);

const under = (file: string, directory: string) =>
  directory === '.' || file === directory || file.startsWith(`${directory}/`);

/**
 * The Storybook's static directories, read the way a build reads them.
 *
 * @param input What loadDoctorInput read.
 * @param projectRoot Absolute Storybook project root.
 *
 * @returns The absolute directories.
 */
async function staticDirectories(input: DoctorInput, projectRoot: string) {
  const { options, packageJson } = input;
  // As getOptions does: the build script only counts when Chromatic builds Storybook itself.
  const buildScriptName =
    options.storybookBuildDir || options.buildCommand
      ? options.buildScriptName
      : findBuildScriptName(packageJson?.scripts ?? {}, options.buildScriptName);
  const deps = {
    log: silentLog(),
    options: { ...options, buildScriptName },
    packageJson: packageJson ?? {},
    env: {},
  } as unknown as StorybookInfoDeps;
  const { staticDirs } = await getStorybookInfo(deps, projectRoot);
  return staticDirs;
}

/**
 * Lists the stylesheets, images and fonts in the Storybook project that TurboSnap can't see: they're in
 * neither the stats file's module graph nor `staticDirs`, and no `externals` or `untraced` glob
 * names them. Offers them as `externals`, from the repository root as TurboSnap matches them, once
 * the user says Storybook reads them, since doctor can't tell an unused file from a Sass partial.
 *
 * @param input What loadDoctorInput read.
 * @param paths Where the repository, the project and the build are.
 * @param paths.gitRoot Absolute repository root.
 * @param paths.projectRoot Absolute Storybook project root, which manifest keys are relative to.
 * @param paths.buildDirectory Absolute folder Storybook was built into, which holds only copies.
 * @param graph The manifest's file keys.
 *
 * @returns One check when there are such files, else none.
 */
export async function unseenFileChecks(
  input: DoctorInput,
  paths: { gitRoot: string; projectRoot: string; buildDirectory: string },
  graph: Iterable<string>
): Promise<Check[]> {
  const { gitRoot, projectRoot } = paths;
  const repoPath = (file: string) => relativeOrDot(gitRoot, path.resolve(projectRoot, file));
  const inGraph = new Set(
    [...graph].filter((key) => !isSyntheticFile(key)).map((key) => repoPath(key))
  );
  const seen = [...(await staticDirectories(input, projectRoot)), paths.buildDirectory].map(
    (directory) => relativeOrDot(gitRoot, directory)
  );
  const project = relativeOrDot(gitRoot, projectRoot);
  const named = [...(input.options.externals ?? []), ...(input.options.untraced ?? [])];

  const unseen: string[] = [];
  try {
    await forEachRepoFile(gitRoot, (file) => {
      if (!STYLESHEET.test(file) && !ASSET.test(file)) return;
      if (!under(file, project) || inGraph.has(file)) return;
      if (seen.some((directory) => under(file, directory))) return;
      if (named.some((glob) => matchesFile(glob, file))) return;
      unseen.push(file);
    });
  } catch {
    // Without git's file list there's nothing to compare the graph with.
    return [];
  }
  if (unseen.length === 0) return [];

  unseen.sort();
  const count =
    unseen.length === 1
      ? '1 stylesheet, image or font'
      : `${unseen.length} stylesheets, images and fonts`;
  const more = unseen.length - FILES_SHOWN;
  const fix = configFix(
    input,
    'externals',
    `Add ${unseen.length === 1 ? 'it' : `these ${unseen.length} files`} to externals`,
    (json) => {
      json.externals = [...(json.externals ?? []), ...unseen.map((file) => asGlob(file))];
    },
    { adds: true }
  );
  return [
    {
      group: 'Values',
      status: 'info',
      title: `${count} outside the module graph and staticDirs`,
      detail: [
        "TurboSnap doesn't track them, so a change to one alone recaptures no stories. If Storybook reads them when it builds, such as Sass partials, files preview-head.html links, or files a plugin loads, list them in externals, from the repository root:",
        ...unseen.slice(0, FILES_SHOWN).map((file) => `- ${file}`),
        ...(more > 0 ? [`- and ${more} more`] : []),
      ].join('\n'),
      fix: fix && { ...fix, question: 'Does Storybook read these files when it builds?' },
    },
  ];
}
