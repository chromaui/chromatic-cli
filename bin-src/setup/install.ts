import { existsSync } from 'node:fs';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { execa } from 'execa';
import semver from 'semver';

import { getPackageManagerName } from '../../node-src/lib/getPackageManager';
import type { Check } from './checks';
import { git, readJson } from './shared';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'yarn-classic';

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
export async function detectPackageManager(gitRoot: string): Promise<PackageManager> {
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
export function installCommand(packageManager: PackageManager) {
  const command = packageManager === 'yarn-classic' ? 'yarn' : packageManager;
  return { command, args: ['install', ...(INSTALL_MUTABLE[packageManager] ?? [])] };
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: MINUTE,
  h: 60 * MINUTE,
  d: DAY,
  w: 7 * DAY,
};

/**
 * Reads one package manager setting, as the project sees it.
 *
 * @param command The package manager.
 * @param args The arguments that print the setting.
 * @param cwd The project's directory.
 *
 * @returns What it printed, or an empty string when it failed.
 */
async function setting(command: string, args: string[], cwd: string) {
  try {
    const { stdout } = await execa(command, args, { cwd, stdin: 'ignore', timeout: 10_000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * The versions of a package an exclusion list, such as Yarn's npmPreapprovedPackages, exempts.
 *
 * @param list The setting printed as JSON: names and globs, such as "@chromatic-com/*", each
 * optionally with a version, such as chromatic@18.15.1.
 * @param name The package.
 *
 * @returns One range per matching pattern: "*" for a pattern without a version, which exempts
 * every release, else its version, which exempts only the releases it matches.
 */
function exemptions(list: string, name: string) {
  let patterns: unknown;
  try {
    patterns = JSON.parse(list);
  } catch {
    return [];
  }
  if (!Array.isArray(patterns)) return [];
  return patterns.flatMap((pattern) => {
    const text = String(pattern);
    // The @ after the name, not a scope's leading one.
    const at = text.indexOf('@', 1);
    const glob = at === -1 ? text : text.slice(0, at);
    const matches = glob.endsWith('*') ? name.startsWith(glob.slice(0, -1)) : glob === name;
    if (!matches) return [];
    return [at === -1 ? '*' : text.slice(at + 1)];
  });
}

/**
 * Yarn's npmMinimalAgeGate: minutes, a duration such as 1d, or { secs, nanos } in newer Yarn.
 *
 * @param value What `yarn config get npmMinimalAgeGate` printed.
 *
 * @returns The age in milliseconds.
 */
function yarnAge(value: string) {
  if (value.startsWith('{')) {
    try {
      return Number(JSON.parse(value).secs) * 1000;
    } catch {
      return 0;
    }
  }
  const duration = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(value);
  return duration ? Number(duration[1]) * DURATION_UNITS[duration[2]] : Number(value) * MINUTE;
}

interface ReleaseAge {
  /** The minimum age, in milliseconds. */
  age: number;
  /** Ranges of versions the package manager installs whatever their age. */
  exempt: string[];
}

// How each package manager sets the youngest release it installs, and which packages it exempts.
const RELEASE_AGES: Partial<
  Record<PackageManager, (cwd: string, name: string) => Promise<ReleaseAge>>
> = {
  yarn: async (cwd, name) => {
    const [age, preapproved] = await Promise.all([
      setting('yarn', ['config', 'get', 'npmMinimalAgeGate'], cwd),
      setting('yarn', ['config', 'get', 'npmPreapprovedPackages', '--json'], cwd),
    ]);
    return { age: yarnAge(age), exempt: exemptions(preapproved, name) };
  },
  pnpm: async (cwd, name) => {
    const [minutes, excluded] = await Promise.all([
      setting('pnpm', ['config', 'get', 'minimumReleaseAge'], cwd),
      setting('pnpm', ['config', 'get', 'minimumReleaseAgeExclude', '--json'], cwd),
    ]);
    // pnpm goes by the first entry that names the package, even when its versions don't match.
    return { age: Number(minutes) * MINUTE, exempt: exemptions(excluded, name).slice(0, 1) };
  },
  npm: async (cwd) => {
    const [days, before] = await Promise.all([
      setting('npm', ['config', 'get', 'min-release-age'], cwd),
      setting('npm', ['config', 'get', 'before'], cwd),
    ]);
    return {
      age: Math.max(Number(days) * DAY || 0, Date.now() - Date.parse(before) || 0),
      exempt: [],
    };
  },
};

/**
 * How old a release of a package must be before the project's package manager installs it: Yarn's
 * npmMinimalAgeGate (one day by default since Yarn 4.15), pnpm's minimumReleaseAge, npm's
 * min-release-age and before. Packages the package manager exempts by name, such as through
 * npmPreapprovedPackages or minimumReleaseAgeExclude, have none; versions it exempts are listed.
 *
 * @param cwd The directory with the package.json the package goes in.
 * @param name The package, such as chromatic.
 *
 * @returns The age in milliseconds, 0 when there's none, and the exempt versions. Remembered for
 * the run.
 */
function minimumReleaseAge(cwd: string, name: string): Promise<ReleaseAge> {
  return remember(`age\0${cwd}\0${name}`, async () => {
    const { packageManager } = await projectPackageManager(cwd);
    const { age, exempt } = (await RELEASE_AGES[packageManager]?.(cwd, name)) ?? {
      age: 0,
      exempt: [],
    };
    if (!Number.isFinite(age) || age <= 0 || exempt.includes('*')) return { age: 0, exempt: [] };
    return { age, exempt };
  });
}

// Doctor checks again after each fix; ask the package manager and the registry once per run.
const remembered = new Map<string, Promise<any>>();
function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!remembered.has(key)) remembered.set(key, load());
  return remembered.get(key) as Promise<T>;
}

function projectPackageManager(cwd: string) {
  return remember(`pm\0${cwd}`, async () => {
    const gitRoot = git(['rev-parse', '--show-toplevel'], cwd) ?? cwd;
    return { packageManager: await detectPackageManager(gitRoot), gitRoot };
  });
}

// The setting that names the registry each package manager installs from.
const REGISTRY_SETTINGS: Record<PackageManager, [string, string[]]> = {
  npm: ['npm', ['config', 'get', 'registry']],
  pnpm: ['pnpm', ['config', 'get', 'registry']],
  yarn: ['yarn', ['config', 'get', 'npmRegistryServer']],
  'yarn-classic': ['yarn', ['config', 'get', 'registry']],
};

/**
 * The registry the project installs from, so a version doctor picks is one its install can find.
 *
 * @param cwd The project's directory.
 *
 * @returns The registry's URL, ending in a slash; npm's own when the setting can't be read.
 */
function registryUrl(cwd: string) {
  return remember(`registry\0${cwd}`, async () => {
    const { packageManager } = await projectPackageManager(cwd);
    const [command, args] = REGISTRY_SETTINGS[packageManager];
    const url = await setting(command, args, cwd);
    return /^https?:\/\//.test(url) ? url.replace(/\/?$/, '/') : 'https://registry.npmjs.org/';
  });
}

/**
 * Reads a package's metadata from the project's registry. A registry that needs a login, or doesn't
 * answer, gives nothing, and the version stays as wanted for the install to decide.
 *
 * @param cwd The project's directory.
 * @param name The package.
 * @param path What to read below the package, such as "latest".
 *
 * @returns The JSON, or undefined.
 */
async function registry(
  cwd: string,
  name: string,
  path = ''
): Promise<Record<string, any> | undefined> {
  // Registries take a scoped name with its slash escaped, as npm sends it.
  const url = `${await registryUrl(cwd)}${name.replace('/', '%2f')}${path ? `/${path}` : ''}`;
  return remember(url, async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return response.ok ? await response.json() : undefined;
    } catch {
      return undefined;
    }
  });
}

/**
 * The newest stable release, no newer than a ceiling, published before a cutoff.
 *
 * @param time The registry's publish time for each version.
 * @param ceiling The newest version to consider.
 * @param cutoff The latest publish time to accept, in milliseconds.
 * @param exempt Ranges of versions accepted whatever their publish time.
 *
 * @returns The version, or undefined when none is old enough.
 */
function newestOldEnough(
  time: Record<string, string>,
  ceiling: string,
  cutoff: number,
  exempt: string[]
) {
  return Object.keys(time)
    .filter((v) => semver.valid(v) && !semver.prerelease(v) && semver.lte(v, ceiling))
    .filter(
      (version) =>
        Date.parse(time[version]) <= cutoff ||
        exempt.some((range) => semver.satisfies(version, range))
    )
    .sort(semver.rcompare)
    .at(0);
}

/**
 * The newest release of a package that the project's install accepts, as storybook init picks
 * one: the wanted version, unless the package manager's minimum release age refuses it, in which
 * case the newest stable release below it that's old enough.
 *
 * @param name The package, such as chromatic.
 * @param cwd The directory with the package.json the package goes in.
 * @param wanted The version to add, such as this CLI's own. The latest release when omitted.
 *
 * @returns The version, or undefined when none was wanted and the registry didn't answer.
 */
export async function installableVersion(
  name: string,
  cwd: string,
  wanted?: string
): Promise<string | undefined> {
  const gate = await minimumReleaseAge(cwd, name);
  if (gate.age) return oldEnoughVersion(cwd, name, gate, wanted);
  if (wanted) return wanted;
  const latest = await registry(cwd, name, 'latest');
  return latest?.version;
}

/**
 * The wanted version, or the newest stable one below it, published at least an age ago.
 *
 * @param cwd The project's directory, whose registry has the publish times.
 * @param name The package.
 * @param gate The minimum release age and the versions exempt from it.
 * @param wanted The version to add. The latest release when omitted.
 *
 * @returns The version, or the wanted one when the registry can't say.
 */
async function oldEnoughVersion(cwd: string, name: string, gate: ReleaseAge, wanted?: string) {
  const packument = await registry(cwd, name);
  const time: Record<string, string> = packument?.time ?? {};
  const ceiling: string | undefined = wanted ?? packument?.['dist-tags']?.latest;
  // Without its publish time, doctor can't tell; keep it and let the install decide.
  if (!ceiling || !time[ceiling]) return ceiling;
  return newestOldEnough(time, ceiling, Date.now() - gate.age, gate.exempt) ?? ceiling;
}

// What each package manager prints when its minimum release age refuses a package, the line that
// names the package and version, and the setting that does it.
const RELEASE_AGE_ERRORS = [
  {
    marker: /YN0016.*quarantined/,
    blocked: /((?:@[\w.-]+\/)?[\w.-]+)@npm:([^:\s]+): All versions satisfying/,
    setting: 'npmMinimalAgeGate in .yarnrc.yml (one day by default)',
    allow: 'npmPreapprovedPackages',
  },
  {
    marker: /ERR_PNPM_NO_MATURE_MATCHING_VERSION/,
    blocked: /((?:@[\w.-]+\/)?[\w.-]+)@(\S+) was published at/,
    setting: 'minimumReleaseAge in pnpm-workspace.yaml',
    allow: 'minimumReleaseAgeExclude',
  },
  {
    // pnpm 10 before NO_MATURE: the same code as a missing version, with the release date.
    marker: /ERR_PNPM_NO_MATCHING_VERSION[^\n]*satisfies the specs but was released at/,
    blocked: /found for ((?:@[\w.-]+\/)?[\w.-]+)@(\S+) published by/,
    setting: 'minimumReleaseAge in pnpm-workspace.yaml',
    allow: 'minimumReleaseAgeExclude',
  },
  {
    marker: /No matching version found for .* with a date before/,
    blocked: /found for ((?:@[\w.-]+\/)?[\w.-]+)@(\S+) with a date before/,
    setting: 'min-release-age or before in .npmrc',
    allow: 'a lower setting',
  },
];

/**
 * Explains a failed install that the package manager's minimum release age caused, in place of
 * its error code, such as Yarn's YN0016.
 *
 * @param output The install's output.
 * @param shown The install command, as shown to the user.
 *
 * @returns The check's title and detail, or undefined when something else failed.
 */
function releaseAgeFailure(output: string, shown: string) {
  const known = RELEASE_AGE_ERRORS.find(({ marker }) => marker.test(output));
  if (!known) return undefined;
  const match = known.blocked.exec(output);
  const blocked = match ? `${match[1]}@${match[2]}` : 'a package';
  return {
    title: `${shown.split(' ')[0]} won't install ${blocked} yet`,
    detail: `It was published more recently than ${known.setting} allows. package.json keeps its changes. Run ${shown} again once it's old enough, change it to an older release, or exempt it with ${known.allow}.`,
  };
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
    const all = String((err as { all?: string }).all ?? err).trim();
    const output = all.split('\n').slice(-6).join('\n');
    return {
      group: 'Loading',
      status: 'fail',
      ...(releaseAgeFailure(all, shown) ?? {
        title: `${command} install failed`,
        detail: `package.json keeps the fixes. Run ${shown} to install them. Its output ended:\n${output}`,
      }),
    };
  }
  if (spinner) spinner.stop(`Installed with ${command}`);
  else clack.log.success(`Installed with ${command}`);
  return undefined;
}
