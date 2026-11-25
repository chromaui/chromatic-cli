import { existsSync } from 'node:fs';
import path from 'node:path';

import { getStorybookProjectRoot } from '../../node-src/lib/getStorybookProjectRoot';
import { createLogger } from '../../node-src/lib/log';
import { buildManifest } from '../../node-src/lib/turbosnap/v2/manifest';
import { isInstalledPackagePath, isSyntheticFile } from '../../node-src/lib/turbosnap/v2/paths';
import { realProjectFiles } from '../../node-src/lib/turbosnap/v2/projectFiles';
import { readStatsFile } from '../../node-src/tasks/readStatsFile';
import type { Check } from './checks';
import type { DoctorInput } from './doctorInput';
import { git, relativeOrDot } from './shared';

const HISTORY_DAYS = 90;
const IMPORTS_SHOWN = 5;
const PREVIEW_FILE = /^preview\.[cm]?[jt]sx?$/;

type Graph = Map<string, { dependencies: Set<string> }>;

/**
 * Every file the roots reach.
 *
 * @param graph The manifest's files and their dependencies.
 * @param roots Where to start.
 *
 * @returns The files reached, roots included.
 */
function reach(graph: Graph, roots: Iterable<string>) {
  const seen = new Set<string>();
  const queue = [...roots];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(graph.get(file)?.dependencies ?? []));
  }
  return seen;
}

const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/**
 * Splits files into the project's own and installed packages', leaving out the builder's
 * generated modules.
 *
 * @param files Manifest keys.
 *
 * @returns The project files, and how many package files there are.
 */
function split(files: Iterable<string>) {
  const real = [...files].filter((file) => !isSyntheticFile(file));
  const project = real.filter((file) => !isInstalledPackagePath(file));
  return { project, packages: real.length - project.length };
}

const describe = ({ project, packages }: ReturnType<typeof split>) =>
  `${plural(project.length, 'project file')} and ${plural(packages, 'package file')}`;

// Shorter, for one line per import: "12 project and 340 package files".
const brief = ({ project, packages }: ReturnType<typeof split>) =>
  `${project.length.toLocaleString('en-US')} project and ${plural(packages, 'package file')}`;

/**
 * Counts the recent commits that changed any of the files, from the history of this clone.
 *
 * @param gitRoot Absolute repository root.
 * @param files Repository-relative paths.
 *
 * @returns How many commits changed one, and how often each file changed; 'shallow' when the clone
 * lacks the history; or undefined when git can't read it.
 */
function recentChanges(gitRoot: string, files: Set<string>) {
  const shallow = git(['rev-parse', '--is-shallow-repository'], gitRoot);
  if (shallow === 'true') return 'shallow';
  if (shallow !== 'false') return undefined;
  const log = git(
    [
      '-c',
      'core.quotePath=false',
      'log',
      `--since=${HISTORY_DAYS}.days`,
      '--format=%x00%H',
      '--name-only',
    ],
    gitRoot
  );
  if (log === undefined) return undefined;
  let commits = 0;
  const perFile = new Map<string, number>();
  for (const commit of log.split('\0').slice(1)) {
    const touched = commit
      .split('\n')
      .slice(1)
      .filter((file) => files.has(file));
    if (touched.length > 0) commits += 1;
    for (const file of touched) perFile.set(file, (perFile.get(file) ?? 0) + 1);
  }
  return { commits, perFile };
}

/**
 * The line about how often the project files behind preview changed.
 *
 * @param gitRoot Absolute repository root.
 * @param files Repository-relative project files behind preview.
 *
 * @returns The line, and how many commits changed one, or undefined when git can't tell.
 */
function historyLine(gitRoot: string, files: Set<string>) {
  if (files.size === 0) return { commits: 0 };
  const changes = recentChanges(gitRoot, files);
  // Unknown history is info, not a pass.
  if (changes === 'shallow') {
    return {
      commits: undefined,
      line: "This clone is shallow, so doctor can't tell how often they change.",
    };
  }
  if (!changes) {
    return {
      commits: undefined,
      line: "Doctor couldn't read the git history to tell how often they change.",
    };
  }
  if (changes.commits === 0) {
    return {
      commits: 0,
      line: `No commit in the last ${HISTORY_DAYS} days changed one of the project files. (Packages change through the lockfile, so they aren't counted.)`,
    };
  }
  const often = [...changes.perFile]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([file, n]) => `${file} (${n})`);
  return {
    commits: changes.commits,
    line: `${plural(changes.commits, 'commit')} in the last ${HISTORY_DAYS} days changed one of the project files. Most often: ${often.join(', ')}. (Packages change through the lockfile, so they aren't counted.)`,
  };
}

/**
 * What one preview file reaches, how often those files change, and which of its imports bring
 * them in.
 *
 * @param input What loadDoctorInput read.
 * @param graph The manifest's files.
 * @param preview The preview file's manifest key.
 * @param display Turns a manifest key into a path to show.
 * @param repoPath Turns a manifest key into a repository-relative path.
 * @param shownStats The stats file, as shown.
 * @param skipped Files TurboSnap doesn't hash, such as untraced ones, whose changes recapture nothing.
 *
 * @returns The check.
 */
function previewCheck(
  input: DoctorInput & { gitRoot: string },
  graph: Graph,
  preview: string,
  display: (key: string) => string,
  repoPath: (key: string) => string,
  shownStats: string,
  skipped: ReadonlySet<string>
): Check {
  // A skipped file is still walked through, but a change to it recaptures nothing, so it isn't counted.
  const counted = (files: Iterable<string>) =>
    [...files].filter((file) => file !== preview && !skipped.has(file));
  const reached = split(counted(reach(graph, [preview])));
  const history = historyLine(
    input.gitRoot,
    new Set(reached.project.map((file) => repoPath(file)).filter((file) => !file.startsWith('..')))
  );

  const direct = [...(graph.get(preview)?.dependencies ?? [])];
  const imports = direct
    .map((dependency) => {
      const below = reach(graph, [dependency]);
      const through = split(counted(below));
      // What preview still reaches through its other imports, even when one of them also reaches
      // this import's file.
      const withoutIt = reach(
        graph,
        direct.filter((other) => other !== dependency)
      );
      const only = split(counted([...below].filter((file) => !withoutIt.has(file))));
      // The project file below it that imports the most, which is usually the barrel.
      const widest = through.project
        .map((file) => ({ file, imports: graph.get(file)?.dependencies.size ?? 0 }))
        .sort((a, b) => b.imports - a.imports)
        .at(0);
      return { dependency, through, only, widest };
    })
    .filter(({ through }) => through.project.length + through.packages > 0)
    .sort(
      (a, b) =>
        b.only.project.length - a.only.project.length ||
        b.only.packages - a.only.packages ||
        b.through.project.length - a.through.project.length
    );

  const lines = [
    'With TurboSnap, a change to any of them recaptures every story.',
    ...(history.line ? [history.line] : []),
    ...(imports.length > 0 ? ['Imports that reach the most, and what only they reach:'] : []),
    ...imports.slice(0, IMPORTS_SHOWN).map(({ dependency, through, only, widest }) => {
      let barrel = '';
      if (widest && widest.imports >= 5) {
        barrel =
          widest.file === dependency
            ? `; imports ${widest.imports} files itself, like a barrel`
            : `; ${display(widest.file)} below it imports ${widest.imports} files, like a barrel`;
      }
      return `- ${display(dependency)}: ${brief(through)} (only through it: ${only.project.length} and ${only.packages})${barrel}`;
    }),
    `To see how preview reaches one file, run chromatic trace -s ${shownStats} <file>.`,
  ];
  // A warning only when the files behind preview changed recently, info when git can't tell, and
  // never a failure.
  let status: Check['status'] = history.commits ? 'warn' : 'pass';
  if (history.commits === undefined) status = 'info';
  return {
    group: 'Values',
    status,
    title: `${display(preview)} reaches ${describe(reached)}`,
    detail: lines.join('\n'),
  };
}

/**
 * Builds the TurboSnap manifest a build would, from the stats file and the options doctor read.
 *
 * @param input What loadDoctorInput read.
 * @param paths Where the repository, the Storybook project and the stats file are.
 * @param paths.gitRoot Absolute repository root.
 * @param paths.projectRoot Absolute Storybook project root.
 * @param paths.statsFile Absolute path of preview-stats.json.
 *
 * @returns The manifest.
 */
async function readManifest(
  input: DoctorInput,
  paths: { gitRoot: string; projectRoot: string; statsFile: string }
) {
  const { options } = input;
  const log = createLogger({}, { logLevel: 'silent' });
  return buildManifest(await readStatsFile(paths.statsFile), {
    log,
    projectRoot: paths.projectRoot,
    gitRoot: paths.gitRoot,
    untraced: options.untraced ?? [],
    configDir: input.storybookConfigDirectory,
    staticDirs: [],
    externals: options.externals ?? [],
    projectFiles: realProjectFiles({ log, options }),
  });
}

/**
 * Where `storybook build --stats-json` writes the stats file: the prebuilt folder, else the
 * default output folder.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The absolute path.
 */
function statsFileFor(input: DoctorInput) {
  const folder = input.options.storybookBuildDir || 'storybook-static';
  return path.join(path.resolve(input.cwd, folder), 'preview-stats.json');
}

/**
 * Shows what the Storybook preview pulls in, from an existing stats file: with TurboSnap, a change
 * to any of those files recaptures every story. Read-only, with no fix: it changes no hash or
 * capture decision.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns One check per preview file, or one that says how to make a stats file.
 */
export async function previewReachChecks(input: DoctorInput): Promise<Check[]> {
  const { gitRoot, options } = input;
  // TurboSnap doesn't apply to Playwright or Cypress, and Vitest's Storybook ships in a package.
  if (!gitRoot || options.playwright || options.cypress || options.vitest) return [];
  const statsFile = statsFileFor(input);
  const relative = relativeOrDot(input.cwd, statsFile);
  const shown = relative.startsWith('..') ? statsFile : relative;
  if (!existsSync(statsFile)) {
    return [
      {
        group: 'Values',
        status: 'info',
        title: `No ${shown} to show what preview imports`,
        detail: `Build Storybook into ${path.dirname(shown)} with --stats-json, then run doctor again. With TurboSnap, a change to any file preview imports recaptures every story.`,
      },
    ];
  }

  const projectRoot = getStorybookProjectRoot({
    storybookBaseDir: options.storybookBaseDir,
    gitRootPath: gitRoot,
  });
  let manifest: Awaited<ReturnType<typeof buildManifest>>;
  try {
    manifest = await readManifest(input, { gitRoot, projectRoot, statsFile });
  } catch (err) {
    return [
      {
        group: 'Values',
        status: 'info',
        title: `Couldn't read ${shown} to show what preview imports`,
        detail: err instanceof Error ? err.message : String(err),
      },
    ];
  }

  const absolute = (key: string) => path.resolve(projectRoot, key);
  const configKey = relativeOrDot(projectRoot, input.storybookConfigDirectory);
  const previews = [...manifest.attribution.previewSubtree].filter(
    (file) =>
      path.posix.dirname(file).replace(/^\.\//, '') === configKey &&
      PREVIEW_FILE.test(path.posix.basename(file))
  );
  return previews.map((preview) =>
    previewCheck(
      { ...input, gitRoot },
      manifest.files,
      preview,
      (key) => relativeOrDot(input.cwd, path.isAbsolute(key) ? key : absolute(key)),
      (key) => relativeOrDot(gitRoot, absolute(key)),
      shown,
      new Set(manifest.skippedFiles.keys())
    )
  );
}
