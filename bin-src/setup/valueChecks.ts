import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import type { Check, Fix } from './checks';
import { findMainFile, matchesBranch } from './checks';
import { findTestConfig, isDirectory } from './detect';
import { configFix, DoctorInput, globSuggestions } from './doctorInput';
import { relativeOrDot, tokenEnvironmentEdits } from './shared';

/**
 * Finds a package script that turns TurboSnap on outside the config file.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The script's name, or undefined.
 */
function onlyChangedScript(input: DoctorInput) {
  const scripts: Record<string, string> = input.packageJson?.scripts ?? {};
  return Object.keys(scripts).find(
    (name) =>
      /\bchromatic\b/.test(scripts[name]) &&
      /--only-changed(?!=false)(?=[\s=]|$)/.test(scripts[name])
  );
}

/**
 * The question for fixes that are only right when CI runs Chromatic from this project, which
 * doctor can't see.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The question.
 */
function runsHereQuestion(input: DoctorInput) {
  const here = input.gitRoot ? relativeOrDot(input.gitRoot, input.cwd) : '.';
  return here === '.'
    ? 'Does CI run Chromatic from the repository root?'
    : `Does CI run Chromatic from ${here}?`;
}

const VITEST_CONFIG = /^vite(?:st)?\.config\.[cm]?[jt]s$/;

/**
 * Whether the Vitest config sets chromaticPlugin's turboSnap option, without which the tests write
 * nothing for TurboSnap to read and a build with onlyChanged fails.
 *
 * @param cwd The project's directory.
 *
 * @returns The config file that calls chromaticPlugin, and true or false when its options say.
 * Only the file when doctor can't tell, such as when the options are in a variable; no file when
 * there's no Vitest config.
 */
function vitestTurboSnap(cwd: string) {
  const files = readdirSync(cwd)
    .filter((name) => VITEST_CONFIG.test(name))
    .sort()
    .reverse();
  for (const file of files) {
    const text = readFileSync(path.join(cwd, file), 'utf8');
    if (/chromaticPlugin\(\s*\{[^}]*\bturboSnap\s*:\s*true\b/.test(text)) {
      return { file, turboSnap: true };
    }
    if (/chromaticPlugin\(\s*(?:\{[^}]*\}\s*)?\)/.test(text)) return { file, turboSnap: false };
  }
  return { file: files[0] };
}

// The folder Vitest runs from, which may be above the project, such as a repo-root config with
// test.projects.
const vitestFolder = (input: DoctorInput) =>
  path.dirname(findTestConfig('vitest', input.cwd, input.gitRoot) ?? path.join(input.cwd, '-'));

/**
 * The fix that turns TurboSnap on, offered only when the build will have the stats file it reads.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The fix, with a question when doctor can't tell; undefined when it knows it would fail,
 * or when it found no Storybook or Vitest config, which already fails.
 */
function turnOnFix(input: DoctorInput) {
  const fix = configFix(
    input,
    'onlyChanged',
    'onlyChanged.enable',
    'Turn on TurboSnap with "onlyChanged": true',
    (json) => {
      json.onlyChanged = true;
    },
    { adds: true }
  );
  if (input.options.vitest) {
    const { file, turboSnap } = vitestTurboSnap(vitestFolder(input));
    if (!file || turboSnap === false) return undefined;
    return turboSnap
      ? fix
      : withQuestion(fix, 'Does chromaticPlugin in your Vitest config set turboSnap: true?');
  }
  if (!findMainFile(input.storybookConfigDirectory)) return undefined;
  // CI may upload a Storybook it built itself, which doctor can't see. One built with the package's
  // build script has stats when the script asks for them.
  const scripts: Record<string, string> = input.packageJson?.scripts ?? {};
  const script = scripts[findBuildScriptName(scripts, input.options.buildScriptName)] ?? '';
  if (/--(?:webpack-)?stats-json\b/.test(script)) return fix;
  return withQuestion(
    fix,
    'Will the Storybook CI uploads to Chromatic include preview-stats.json? It does when Chromatic builds Storybook, or when your own build passes --stats-json.'
  );
}

/**
 * What a Vitest project needs before TurboSnap can work, when its config says it's missing.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The sentence to add to a check's detail, or an empty string.
 */
function vitestPluginNote(input: DoctorInput) {
  if (!input.options.vitest) return '';
  const { file, turboSnap } = vitestTurboSnap(vitestFolder(input));
  return turboSnap === false
    ? ` chromaticPlugin in ${file} doesn't set turboSnap: true, so the tests write nothing for TurboSnap to read and a build with onlyChanged fails. Add turboSnap: true to it first.`
    : '';
}

// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function onlyChangedChecks(input: DoctorInput): Check[] {
  const { onlyChanged, playwright, cypress } = input.options;
  if (playwright || cypress) {
    // TurboSnap can't trace a built app's E2E tests, so it doesn't apply to them.
    if (onlyChanged === undefined || onlyChanged === false) return [];
    return [
      {
        group: 'Values',
        status: 'warn',
        title: `onlyChanged has no effect on ${playwright ? 'Playwright' : 'Cypress'} tests`,
        detail: 'TurboSnap only works with Storybook and Vitest.',
        fix: configFix(
          input,
          'onlyChanged',
          'onlyChanged.remove',
          'Remove onlyChanged from the config file',
          (json) => {
            delete json.onlyChanged;
          }
        ),
      },
    ];
  }
  // The config file and flags don't say; the script may still pass --only-changed.
  const script = onlyChanged === undefined ? onlyChangedScript(input) : undefined;
  if (script) {
    return [
      { group: 'Values', status: 'pass', title: `TurboSnap is set in the "${script}" script` },
    ];
  }
  if (onlyChanged === undefined || onlyChanged === false) {
    return [
      {
        group: 'Values',
        status: 'warn',
        title: onlyChanged === false ? 'TurboSnap is off' : "TurboSnap isn't on here",
        detail:
          onlyChanged === false
            ? '"onlyChanged" is false, so every build captures every story.'
            : `Not the config file, flags or a package script turn it on. If CI passes --only-changed, it's on there; otherwise set "onlyChanged": true to test only the stories your changes affect.${input.options.vitest ? vitestPluginNote(input) : ' If CI uploads a prebuilt Storybook (--storybook-build-dir), build it with --stats-json first.'}`,
        // Leave an explicit false alone; that's a choice, not a gap. A prebuilt Storybook may have
        // no stats file, and TurboSnap fails the build without one.
        fix: onlyChanged === undefined && !input.prebuilt ? turnOnFix(input) : undefined,
      },
    ];
  }
  if (typeof onlyChanged === 'string') {
    const trimmed = onlyChanged.trim().replace(/,$/, '');
    if (['true', 'false'].includes(trimmed)) {
      return [
        {
          group: 'Values',
          status: 'fail',
          title: `onlyChanged is the text "${onlyChanged}", not ${trimmed}`,
          detail: `Chromatic reads it as a branch name, so TurboSnap only runs on a branch called "${onlyChanged}".`,
          fix: configFix(
            input,
            'onlyChanged',
            'onlyChanged.setBoolean',
            `Set "onlyChanged": ${trimmed} in the config file`,
            (json) => {
              json.onlyChanged = trimmed === 'true';
            }
          ),
        },
      ];
    }
    if (input.branch && !matchesBranch(input.branch, onlyChanged)) {
      return [
        {
          group: 'Values',
          status: 'warn',
          title: `TurboSnap is off on this branch`,
          detail: `onlyChanged is "${onlyChanged}", which doesn't match the branch "${input.branch}".`,
        },
      ];
    }
  }
  const missing = vitestPluginNote(input);
  if (missing) {
    return [
      {
        group: 'Values',
        status: 'fail',
        title: "TurboSnap is on, but Vitest doesn't write what it reads",
        detail: missing.trim(),
      },
    ];
  }
  return [{ group: 'Values', status: 'pass', title: 'TurboSnap is on' }];
}

function configDirectoryChecks(input: DoctorInput): Check[] {
  const { cwd, gitRoot, options } = input;
  const value = options.storybookConfigDir;
  if (value === undefined) return [];
  if (isDirectory(input.storybookConfigDirectory)) {
    return [{ group: 'Values', status: 'pass', title: `storybookConfigDir ${value} exists` }];
  }
  if (existsSync(input.storybookConfigDirectory)) {
    return [
      {
        group: 'Values',
        status: 'fail',
        title: `storybookConfigDir ${value} isn't a folder`,
        detail: "Point it at the folder with Storybook's main config, such as .storybook.",
      },
    ];
  }

  // A repo-root path used from a subdirectory doubles up, like packages/ui/packages/ui/.storybook.
  // The fix sets the right path rather than removing the option, because without it the build
  // script's -c would decide instead.
  const normalized = value.replace(/^\.\//, '').replace(/\/$/, '');
  const prefix = gitRoot ? relativeOrDot(gitRoot, cwd) : '.';
  const rebased =
    prefix !== '.' && normalized.startsWith(`${prefix}/`)
      ? normalized.slice(prefix.length + 1)
      : undefined;
  const rebasedExists = rebased !== undefined && existsSync(path.join(cwd, rebased));
  return [
    {
      group: 'Values',
      status: 'fail',
      title: `storybookConfigDir ${value} doesn't exist`,
      detail: rebasedExists
        ? `It's relative to the repository root, but Chromatic reads it from ${prefix}. Here it's ${rebased}. If CI runs Chromatic from the root with --config-file, it reads the path as written.`
        : `Chromatic looks for it at ${relativeOrDot(cwd, input.storybookConfigDirectory)}.`,
      // A CI that runs Chromatic from the root, with --config-file, reads the path as it is.
      fix: rebasedExists
        ? withQuestion(
            configFix(
              input,
              'storybookConfigDir',
              'storybookConfigDir.rebase',
              `Set storybookConfigDir to ${rebased}`,
              (json) => {
                json.storybookConfigDir = rebased;
              }
            ),
            runsHereQuestion(input)
          )
        : undefined,
    },
  ];
}

function baseDirectoryChecks(input: DoctorInput): Check[] {
  const { gitRoot, options } = input;
  const value = options.storybookBaseDir;
  if (value === undefined || !gitRoot) return [];
  if (!existsSync(path.resolve(gitRoot, value))) {
    return [
      {
        group: 'Values',
        status: 'fail',
        title: `storybookBaseDir ${value} doesn't exist`,
        detail: 'It is relative to the repository root.',
      },
    ];
  }
  // Naming this project's own package is correct: redundant when CI runs Chromatic from here,
  // and the only thing that points TurboSnap at the package when CI runs it from the root.
  return [{ group: 'Values', status: 'pass', title: `storybookBaseDir ${value} exists` }];
}

function buildDirectoryChecks(input: DoctorInput): Check[] {
  const { options, packageJson } = input;
  // An invalid folder is reported with the other Storybook checks.
  if (!options.storybookBuildDir || input.buildDirectoryError) return [];
  const scriptName = findBuildScriptName(packageJson?.scripts, options.buildScriptName);
  const canBuild = !!packageJson?.scripts?.[scriptName];
  if (!options.onlyChanged || !canBuild) return [];
  // No fix: the script may not build the Storybook that's in the folder, and a working prebuilt
  // upload would turn into a failing build.
  return [
    {
      group: 'Values',
      status: 'warn',
      title: 'storybookBuildDir stops Chromatic building Storybook',
      detail: `With TurboSnap on, a stale or stats-less build can hide changes. If the "${scriptName}" script builds this Storybook, remove storybookBuildDir.`,
    },
  ];
}

function globChecks(input: DoctorInput): Check[] {
  const checks: Check[] = [];
  for (const key of ['untraced', 'externals'] as const) {
    for (const glob of input.options[key] ?? []) {
      const count = input.globMatches.get(glob) ?? 0;
      checks.push(
        count > 0
          ? {
              group: 'Values',
              status: 'pass',
              title: `${key} ${glob} matches ${count} file${count === 1 ? '' : 's'}`,
            }
          : unmatchedGlobCheck(input, key, glob)
      );
    }
  }
  return checks;
}

/**
 * A glob near an unmatched one that matches files: the same glob from this project's folder, or
 * from the one folder all its matches anywhere in the repository are in.
 *
 * @param input What doctor read.
 * @param glob The glob that matches nothing.
 *
 * @returns The suggestion, how many files it matches, and the folders when they are several.
 */
function globSuggestion(input: DoctorInput, glob: string) {
  const { globMatches, globFolders, cwd, gitRoot } = input;
  const prefix = gitRoot ? relativeOrDot(gitRoot, cwd) : '.';
  const found = globSuggestions(glob, prefix).find((c) => (globMatches.get(c) ?? 0) > 0);
  if (!found) return undefined;
  const count = globMatches.get(found) ?? 0;
  if (!found.startsWith('**/')) return { glob: found, count };
  // A `**/` glob matches in every folder, which in a monorepo includes other packages, such as
  // shared code whose changes should recapture stories. When every match is in one folder, that
  // folder's path is the suggestion; otherwise doctor names the folders but doesn't make the change.
  const folders = [...(globFolders.get(found) ?? [])].sort();
  if (folders.length === 1) return { glob: `${folders[0]}/${found.slice(3)}`, count };
  return { glob: found, count, folders };
}

/**
 * The warning for a glob that matches no files, with a glob that does if there is one.
 *
 * @param input What doctor read.
 * @param key The option the glob is in.
 * @param glob The glob.
 *
 * @returns The check.
 */
function unmatchedGlobCheck(
  input: DoctorInput,
  key: 'untraced' | 'externals',
  glob: string
): Check {
  const suggestion = globSuggestion(input, glob);
  const folders = suggestion?.folders;
  const shown = folders?.slice(0, 3).join(', ');
  const where = folders
    ? `, in ${folders.length > 3 ? `${shown} and ${folders.length - 3} more folders` : shown}`
    : '';
  return {
    group: 'Values',
    status: 'warn',
    title: `${key} ${glob} matches no files`,
    detail: `Globs are matched from the repository root.${suggestion ? ` ${suggestion.glob} matches ${suggestion.count}${where}.` : ''}`,
    fix:
      suggestion && !folders
        ? configFix(
            input,
            key,
            `${key}.retarget:${glob}`,
            `Change ${key} ${glob} to ${suggestion.glob}`,
            (json) => {
              json[key] = json[key].map((g: string) => (g === glob ? suggestion.glob : g));
            }
          )
        : undefined,
  };
}

/**
 * The fix that moves the token out of the config file, or why there's none.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The fix, or the reason doctor can't make it.
 */
function moveTokenFix(input: DoctorInput) {
  const token = input.configJson?.projectToken;
  if (!input.gitRoot || typeof token !== 'string') return {};
  const saved = tokenEnvironmentEdits(input.gitRoot, input.cwd, token);
  if (!saved.edits) return { reason: `doctor can't move it to .env: ${saved.reason}.` };
  const removal = configFix(
    input,
    'projectToken',
    'projectToken.moveToEnv',
    'Move the token to a gitignored .env and remove it from the config file',
    (json) => {
      delete json.projectToken;
    }
  );
  // CI may read the token from this file; removing it before CI has its own would fail its builds.
  return {
    fix: withQuestion(
      removal && { ...removal, edits: [...removal.edits, ...saved.edits], secrets: [token] },
      'Does CI already pass the token as CHROMATIC_PROJECT_TOKEN?'
    ),
  };
}

function tokenInConfigChecks(input: DoctorInput): Check[] {
  if (!input.configKeys.has('projectToken')) return [];
  const { fix, reason } = moveTokenFix(input);
  return [
    {
      group: 'Values',
      status: 'warn',
      title: 'The project token is in the config file',
      detail: `Anyone who can read the repository can publish builds. Give CI the token as CHROMATIC_PROJECT_TOKEN, then remove it here.${reason ? ` ${reason}` : ''}`,
      fix,
    },
  ];
}

/**
 * Adds the question a fix needs answered, which doctor can't answer from the files it reads.
 *
 * @param fix The fix, if there is one.
 * @param question What the user must confirm for the fix to be right.
 *
 * @returns The fix with its question.
 */
function withQuestion(fix: Fix | undefined, question: string): Fix | undefined {
  return fix && { ...fix, question };
}

/**
 * Checks each option's value against what's on disk and in git.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns One result per checked value.
 */
export function valueChecks(input: DoctorInput): Check[] {
  return [
    ...onlyChangedChecks(input),
    ...configDirectoryChecks(input),
    ...baseDirectoryChecks(input),
    ...buildDirectoryChecks(input),
    ...globChecks(input),
    ...tokenInConfigChecks(input),
  ];
}
