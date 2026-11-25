import { existsSync } from 'node:fs';
import path from 'node:path';

import { findBuildScriptName } from '../../node-src/lib/getOptions';
import { createLogger } from '../../node-src/lib/log';
import { setBuildCommand } from '../../node-src/tasks/build/setBuildCommand';
import type { Context, Options } from '../../node-src/types';
import { matchesBranch } from './checks';
import { versionOf } from './detect';
import type { DoctorInput } from './doctorInput';

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
