import { existsSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import type { Check } from './checks';
import { countMatches, matchesBranch } from './checks';
import { ONLY_CHANGED_FLAG } from './ci';
import { configFix, DoctorInput } from './doctorInput';
import { relativeOrDot, tokenEnvironmentEdits } from './shared';

/**
 * Finds where TurboSnap is turned on outside the config file: the package's chromatic script, or a
 * CI step that runs Chromatic for this package.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns Where it's turned on, such as 'the "chromatic" script', or undefined.
 */
function onlyChangedElsewhere(input: DoctorInput) {
  const scripts: Record<string, string> = input.packageJson?.scripts ?? {};
  const script = Object.keys(scripts).find(
    (name) => /\bchromatic\b/.test(scripts[name]) && ONLY_CHANGED_FLAG.test(scripts[name])
  );
  if (script) return `the "${script}" script`;
  const run = input.ci.runs.find((r) => r.onlyChanged);
  return run && `${run.file} (${run.job})`;
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
        fix: configFix(input, 'onlyChanged', 'Remove onlyChanged from the config file', (json) => {
          delete json.onlyChanged;
        }),
      },
    ];
  }
  // The config file and flags don't say; the script or the CI step may still pass --only-changed.
  const elsewhere = onlyChanged === undefined ? onlyChangedElsewhere(input) : undefined;
  if (elsewhere) {
    return [{ group: 'Values', status: 'pass', title: `TurboSnap is set in ${elsewhere}` }];
  }
  if (onlyChanged === undefined || onlyChanged === false) {
    return [
      {
        group: 'Values',
        status: 'warn',
        title: 'TurboSnap is off',
        detail:
          onlyChanged === false
            ? '"onlyChanged" is false, so every build captures every story.'
            : `Nothing turns it on: not the config file, the "chromatic" script, or a CI step. Set "onlyChanged": true to test only the stories your changes affect${input.options.storybookBuildDir ? ', and build Storybook with --stats-json' : ''}.`,
        // Leave an explicit false alone; that's a choice, not a gap. A prebuilt Storybook may have
        // no stats file, and TurboSnap fails the build without one.
        fix:
          onlyChanged === undefined && !input.options.storybookBuildDir
            ? configFix(
                input,
                'onlyChanged',
                'Turn on TurboSnap with "onlyChanged": true',
                (json) => {
                  json.onlyChanged = true;
                },
                { adds: true }
              )
            : undefined,
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
  return [{ group: 'Values', status: 'pass', title: 'TurboSnap is on' }];
}

function configDirectoryChecks(input: DoctorInput): Check[] {
  const { cwd, gitRoot, options } = input;
  const value = options.storybookConfigDir;
  if (value === undefined) return [];
  if (existsSync(input.storybookConfigDirectory)) {
    return [{ group: 'Values', status: 'pass', title: `storybookConfigDir ${value} exists` }];
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
  // A CI that runs Chromatic from the root, with --config-file, reads the path as it is.
  const fixable = rebasedExists && input.ci.runs.length > 0;
  return [
    {
      group: 'Values',
      status: 'fail',
      title: `storybookConfigDir ${value} doesn't exist`,
      detail: rebasedExists
        ? `It's relative to the repository root, but Chromatic reads it from ${prefix}. Here it's ${rebased}.`
        : `Chromatic looks for it at ${relativeOrDot(cwd, input.storybookConfigDirectory)}.`,
      fix: fixable
        ? configFix(input, 'storybookConfigDir', `Set storybookConfigDir to ${rebased}`, (json) => {
            json.storybookConfigDir = rebased;
          })
        : undefined,
    },
  ];
}

function baseDirectoryChecks(input: DoctorInput): Check[] {
  const { cwd, gitRoot, options } = input;
  const value = options.storybookBaseDir;
  if (value === undefined || !gitRoot) return [];
  const target = path.resolve(gitRoot, value);
  if (!existsSync(target)) {
    return [
      {
        group: 'Values',
        status: 'fail',
        title: `storybookBaseDir ${value} doesn't exist`,
        detail: 'It is relative to the repository root.',
      },
    ];
  }
  if (target === cwd) {
    return [
      {
        group: 'Values',
        status: 'warn',
        title: 'storybookBaseDir repeats the default',
        detail: 'Chromatic already uses the directory it runs from.',
        // Only when CI runs Chromatic from here too; from the root, the value isn't the default.
        fix:
          input.ci.runs.length > 0
            ? configFix(
                input,
                'storybookBaseDir',
                'Remove storybookBaseDir from the config file',
                (json) => {
                  delete json.storybookBaseDir;
                }
              )
            : undefined,
      },
    ];
  }
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

// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function globChecks(input: DoctorInput): Check[] {
  const { files, options, cwd, gitRoot } = input;
  const checks: Check[] = [];
  for (const key of ['untraced', 'externals'] as const) {
    for (const glob of options[key] ?? []) {
      const count = countMatches(files, glob);
      if (count > 0) {
        checks.push({
          group: 'Values',
          status: 'pass',
          title: `${key} ${glob} matches ${count} file${count === 1 ? '' : 's'}`,
        });
        continue;
      }
      const prefix = gitRoot ? relativeOrDot(gitRoot, cwd) : '.';
      const candidate = [
        prefix === '.' ? undefined : `${prefix}/${glob.replace(/^\.\//, '')}`,
        glob.startsWith('**/') ? undefined : `**/${glob.replace(/^\.\//, '')}`,
      ].find((c): c is string => !!c && countMatches(files, c) > 0);
      const suggestion = candidate;
      checks.push({
        group: 'Values',
        status: 'warn',
        title: `${key} ${glob} matches no files`,
        detail: `Globs are matched from the repository root.${suggestion ? ` ${suggestion} matches ${countMatches(files, suggestion)}.` : ''}`,
        fix: suggestion
          ? configFix(input, key, `Change ${key} ${glob} to ${suggestion}`, (json) => {
              json[key] = json[key].map((g: string) => (g === glob ? suggestion : g));
            })
          : undefined,
      });
    }
  }
  return checks;
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
  // CI may read the token from this file; removing it before CI has its own would fail its builds.
  if (!input.ci.runs.some((run) => run.passesToken)) {
    return { reason: 'Give CI the token as CHROMATIC_PROJECT_TOKEN first, then remove it here.' };
  }
  const saved = tokenEnvironmentEdits(input.gitRoot, input.cwd, token);
  if (!saved.edits) return { reason: `doctor can't move it to .env: ${saved.reason}.` };
  const removal = configFix(
    input,
    'projectToken',
    'Move the token to a gitignored .env and remove it from the config file',
    (json) => {
      delete json.projectToken;
    }
  );
  return {
    fix: removal && { ...removal, edits: [...removal.edits, ...saved.edits], secrets: [token] },
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
      detail: `Anyone who can read the repository can publish builds. Keep it in CHROMATIC_PROJECT_TOKEN.${reason ? ` ${reason}` : ''}`,
      fix,
    },
  ];
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
