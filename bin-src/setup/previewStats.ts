import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';

import getEnvironment from '../../node-src/lib/getEnvironment';
import { findBuildScriptName } from '../../node-src/lib/getOptions';
import { createLogger } from '../../node-src/lib/log';
import { runCommand } from '../../node-src/lib/shell/shell';
import { setBuildCommand } from '../../node-src/tasks/build/setBuildCommand';
import type { Context, Options } from '../../node-src/types';
import { type Check, matchesBranch } from './checks';
import { versionOf } from './detect';
import type { DoctorInput } from './doctorInput';
import { relativeOrDot } from './shared';

/**
 * Where the user's own `storybook build --stats-json` writes the stats file: the prebuilt folder,
 * else the default output folder.
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
 * Whether doctor builds Storybook for the stats file: TurboSnap is on for this branch, as in a
 * build, and Chromatic builds Storybook itself rather than upload a prebuilt one.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns True when doctor builds.
 */
function buildsHere(input: DoctorInput) {
  const { branch, options } = input;
  if (!branch || !matchesBranch(branch, options.onlyChanged ?? false)) return false;
  return !options.storybookBuildDir;
}

/**
 * The command a TurboSnap build runs to build Storybook, writing the stats file where doctor reads
 * it. Only when TurboSnap is on and Chromatic builds Storybook itself: a prebuilt Storybook comes
 * from the user's own build.
 *
 * @param input What loadDoctorInput read.
 * @param statsFile Where the stats file goes.
 *
 * @returns The command, or undefined when doctor shouldn't build.
 */
async function statsBuildFor(input: DoctorInput, statsFile: string) {
  const { options, gitRoot } = input;
  if (!gitRoot || !buildsHere(input)) return undefined;
  const scripts: Record<string, string> = input.packageJson?.scripts ?? {};
  const buildScriptName = findBuildScriptName(scripts, options.buildScriptName);
  // A custom build command writes wherever it writes, so doctor can't keep it out of the user's
  // folders. Without the script, the build would fail; the build script check already says so.
  if (options.buildCommand || !scripts[buildScriptName]) return undefined;
  const version = versionOf(input.cwd, gitRoot, 'storybook');
  try {
    const command = await setBuildCommand(
      {
        options: { ...options, buildScriptName } as Options,
        log: createLogger({}, { logLevel: 'silent' }),
        env: {} as Context['env'],
      },
      {
        sourceDir: path.dirname(statsFile),
        flags: {},
        storybook: { version } as Context['storybook'],
        // Asks for the stats flag, as --only-changed does.
        turboSnap: {},
      }
    );
    return command ? { command, statsFile } : undefined;
  } catch {
    // The package manager couldn't be found to run the script.
    return undefined;
  }
}

/**
 * The stats file the preview check reads, and the build that writes it when doctor builds one.
 * Like a TurboSnap build, doctor builds Storybook with stats into its own temporary folder, so a
 * stale storybook-static never stands in for that build. Without a build of its own, it reads the
 * prebuilt Storybook or the user's own stats file.
 *
 * @param input What loadDoctorInput read.
 * @param statsDirectory The temporary folder doctor builds into.
 *
 * @returns The stats file, and the build when doctor still has to run it.
 */
export async function previewStats(input: DoctorInput, statsDirectory: string) {
  const built = path.join(statsDirectory, 'preview-stats.json');
  if (existsSync(built)) return { statsFile: built };
  const build = await statsBuildFor(input, built);
  return build ? { statsFile: built, build } : { statsFile: statsFileFor(input) };
}

/**
 * Runs a check's Storybook build with a spinner. When it fails, its output goes to
 * build-storybook.log, where a Chromatic build writes it.
 *
 * @param build The build a check asked for.
 * @param cwd Directory to build from.
 *
 * @returns The check to show in place of the preview check when the build failed, else undefined.
 */
export async function buildStats(build: NonNullable<Check['build']>, cwd: string) {
  // Without a terminal, such as in CI, a spinner prints a line per frame, so log the start instead.
  const spinner = process.stdout.isTTY ? clack.spinner() : undefined;
  const message = 'Building Storybook with stats to check what preview imports';
  if (spinner) spinner.start(message);
  else clack.log.step(`${message}…`);
  const stop = (text: string, failed = false) => {
    if (spinner) spinner[failed ? 'error' : 'stop'](text);
    else clack.log[failed ? 'error' : 'success'](text);
  };
  try {
    await runCommand(build.command, {
      cwd,
      stdin: 'ignore',
      all: true,
      preferLocal: false,
      // As in a build, so a build that hangs stops instead of holding doctor forever.
      timeout: getEnvironment().STORYBOOK_BUILD_TIMEOUT,
      env: { CI: '1', NODE_ENV: process.env.STORYBOOK_NODE_ENV || 'production' },
    });
  } catch (err) {
    // Stats from a build that failed don't describe the Storybook.
    rmSync(build.statsFile, { force: true });
    const logFile = path.join(cwd, 'build-storybook.log');
    writeFileSync(logFile, String((err as { all?: string }).all ?? err));
    stop('Storybook build failed', true);
    return couldNotDetermine(
      `The Storybook build failed. See ${relativeOrDot(process.cwd(), logFile)} for its output. The rest of the report doesn't depend on it.`
    );
  } finally {
    // Keep only the stats file, which the trace hint points at; the rest of the build, including
    // what a failed build left, isn't needed.
    const folder = path.dirname(build.statsFile);
    for (const entry of readdirSync(folder)) {
      if (entry !== path.basename(build.statsFile)) {
        rmSync(path.join(folder, entry), { recursive: true, force: true });
      }
    }
  }
  if (!existsSync(build.statsFile)) {
    const shown = relativeOrDot(process.cwd(), build.statsFile);
    stop(`Storybook built, but wrote no ${shown}`, true);
    return couldNotDetermine(`The Storybook build wrote no ${shown}. It ran: ${build.command}`);
  }
  stop('Built Storybook with stats');
  return undefined;
}

const couldNotDetermine = (detail: string): Check => ({
  group: 'Values',
  status: 'info',
  title: "Couldn't determine the impact of preview imports",
  detail,
});
