import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { execa } from 'execa';

import { getPackageManagerName } from '../../node-src/lib/getPackageManager';
import type { Check } from './checks';
import { git, readJson } from './shared';

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'yarn-classic';

// Lockfiles at the repository root, so a run from inside a workspace package finds the same answer.
const ROOT_LOCKFILES: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];

/**
 * Yarn 1 or Berry: from the packageManager version when there is one, else from .yarnrc.yml.
 *
 * @param name The packageManager field or lockfile's package manager, such as "yarn@4.5.0".
 * @param gitRoot The repository root.
 *
 * @returns Which Yarn it is.
 */
function yarnFlavor(name: string, gitRoot: string): PackageManager {
  const major = /^yarn@(\d+)/.exec(name)?.[1];
  if (major) return major === '1' ? 'yarn-classic' : 'yarn';
  return existsSync(path.join(gitRoot, '.yarnrc.yml')) ? 'yarn' : 'yarn-classic';
}

/**
 * Reads the package manager from the root packageManager field, then from root lockfiles.
 *
 * @param gitRoot The repository root.
 *
 * @returns The package manager, npm when nothing says otherwise.
 */
async function detectPackageManager(gitRoot: string): Promise<PackageManager> {
  const declared = readJson(path.join(gitRoot, 'package.json'))?.packageManager as
    | string
    | undefined;
  const fromRoot = ROOT_LOCKFILES.find(([file]) => existsSync(path.join(gitRoot, file)))?.[1];
  const name =
    declared ?? fromRoot ?? (await getPackageManagerName().catch(() => undefined)) ?? 'npm';
  if (name.startsWith('pnpm')) return 'pnpm';
  if (name.startsWith('yarn')) return yarnFlavor(name, gitRoot);
  return 'npm';
}

// CI defaults pnpm and Yarn Berry to a frozen lockfile, which rejects a dependency just added.
const INSTALL_MUTABLE: Partial<Record<PackageManager, string[]>> = {
  pnpm: ['--no-frozen-lockfile'],
  yarn: ['--no-immutable'],
};

/**
 * The install that updates the lockfile after a change to package.json, even in CI.
 *
 * @param packageManager The project's package manager.
 *
 * @returns The command and its arguments.
 */
function installCommand(packageManager: PackageManager) {
  const command = packageManager === 'yarn-classic' ? 'yarn' : packageManager;
  return { command, args: ['install', ...(INSTALL_MUTABLE[packageManager] ?? [])] };
}

/**
 * Runs the project's install once after fixes change its dependencies, so a CI that installs
 * with a frozen lockfile doesn't fail on them.
 *
 * @param cwd The project's directory.
 *
 * @returns A failing check when the install fails, else undefined.
 */
export async function installDependencies(cwd: string): Promise<Check | undefined> {
  const gitRoot = git(['rev-parse', '--show-toplevel'], cwd) ?? cwd;
  const { command, args } = installCommand(await detectPackageManager(gitRoot));
  const shown = `${command} ${args.join(' ')}`;
  // Without a terminal, such as in CI, a spinner prints a line per frame, so log the start instead.
  const spinner = process.stdout.isTTY ? clack.spinner() : undefined;
  if (spinner) spinner.start(`Installing with ${command}`);
  else clack.log.step(`Running ${shown}…`);
  try {
    // No stdin, so a package manager that wants to ask something fails instead of waiting.
    await execa(command, args, { cwd, stdin: 'ignore', all: true });
  } catch (err) {
    if (spinner) spinner.error(`${command} install failed`);
    else clack.log.error(`${command} install failed`);
    const output = String((err as { all?: string }).all ?? err)
      .trim()
      .split('\n')
      .slice(-6)
      .join('\n');
    return {
      group: 'Loading',
      status: 'fail',
      title: `${command} install failed`,
      detail: `package.json keeps the fixes. Run ${shown} to install them. Its output ended:\n${output}`,
    };
  }
  if (spinner) spinner.stop(`Installed with ${command}`);
  else clack.log.success(`Installed with ${command}`);
  return undefined;
}
