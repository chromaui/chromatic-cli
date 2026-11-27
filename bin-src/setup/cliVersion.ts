import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import semver from 'semver';

import HTTPClient from '../../node-src/io/httpClient';
import { fetchReleases } from '../../node-src/lib/checkForUpdates';
import getEnvironment from '../../node-src/lib/getEnvironment';
import { ensurePnpRuntime, readInstalledVersion } from '../../node-src/lib/installedPackages';
import pkg from '../../package.json';
import type { Check, Fix, FixChoice } from './checks';
import { type DoctorInput, silentLog } from './doctorInput';
import { packageJsonEdit } from './fixes';
import { minimumReleaseAge } from './install';
import { readJson } from './shared';

/** The chromatic version a project has installed, and the latest release. */
export interface CliVersions {
  installed?: string;
  latest?: string;
  /** When each chromatic version was published, as ISO dates by version. */
  published?: Record<string, string>;
  /** How old a release must be, in milliseconds, before the project's package manager installs it. */
  minimumAge?: number;
  /** Ranges of versions the package manager installs whatever their age. */
  exempt?: string[];
  /** Why there's no latest version: the lookup was skipped or failed. */
  noLatest?: string;
}

type Releases = Pick<CliVersions, 'latest' | 'published' | 'noLatest'>;

// One lookup per doctor run, however many projects it checks or how often --fix rechecks them.
let latestLookup: Promise<Releases> | undefined;

function lookUpLatest() {
  const log = silentLog();
  latestLookup ??= fetchReleases({
    http: new HTTPClient({ env: getEnvironment(), log }),
    log,
    pkg,
  })
    .then(
      ({ latest, published }): Releases =>
        semver.valid(latest)
          ? { latest, published }
          : { noLatest: `The registry's latest tag for chromatic isn't a version: ${latest}` }
    )
    .catch((err: unknown) => ({
      noLatest: `Tried to check the npm registry for the latest chromatic release and couldn't: ${err instanceof Error ? err.message : String(err)}`,
    }));
  return latestLookup;
}

/**
 * The chromatic version installed for a directory. Node remembers where it resolved a package for
 * the rest of the run, so after doctor's own install a symlinked node_modules, such as pnpm's, would
 * still show the old copy. This reads the first chromatic on Node's search path afresh, and falls
 * back to resolving it, as Yarn Plug'n'Play needs.
 *
 * @param directory The directory with the package.json that lists chromatic.
 *
 * @returns The version, or undefined when chromatic isn't installed.
 */
function installedVersion(directory: string) {
  const manifest = createRequire(path.join(directory, 'package.json'))
    .resolve.paths('chromatic')
    ?.map((parent) => path.join(parent, 'chromatic', 'package.json'))
    .find((file) => existsSync(file));
  const version = manifest && readJson(manifest)?.version;
  return typeof version === 'string'
    ? version
    : readInstalledVersion(silentLog(), directory, 'chromatic');
}

/**
 * Reads the chromatic version the project resolves, the way Node does, and looks up the latest
 * release on the npm registry, unless skipUpdateCheck is set, with the package manager's minimum
 * release age. A failed lookup becomes the reason in noLatest rather than an error, so doctor still
 * finishes offline.
 *
 * @param input What loadDoctorInput read.
 *
 * @returns The installed and latest versions, or undefined when package.json doesn't list
 * chromatic, so there's no line to show them on.
 */
export async function readCliVersions(input: DoctorInput): Promise<CliVersions | undefined> {
  const { dependencies, devDependencies } = input.packageJson ?? {};
  if (!dependencies?.chromatic && !devDependencies?.chromatic) return undefined;
  const directory = input.packageJsonPath ? path.dirname(input.packageJsonPath) : input.cwd;
  ensurePnpRuntime(directory, silentLog());
  const installed = installedVersion(directory);
  if (input.options.skipUpdateCheck) {
    return {
      installed,
      noLatest: "skipUpdateCheck is set, so doctor didn't look up the latest release.",
    };
  }
  const releases = await lookUpLatest();
  // Only a release the package manager installs is worth a fix.
  const { age: minimumAge, exempt } = releases.latest
    ? await minimumReleaseAge(directory, 'chromatic')
    : { age: 0, exempt: [] };
  return { installed, ...releases, minimumAge, exempt };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function duration(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return plural(minutes, 'minute');
}

/**
 * How far one version is behind another, in its largest part that differs.
 *
 * @param installed The older version.
 * @param latest The newer version.
 *
 * @returns Such as "2 minor versions behind", and whether a major version separates them.
 */
function behind(installed: string, latest: string) {
  const parts = ['major', 'minor', 'patch'] as const;
  for (const part of parts) {
    const difference = semver[part](latest) - semver[part](installed);
    if (difference > 0) {
      return {
        text: `${plural(difference, `${part} version`)} behind`,
        major: part === 'major',
      };
    }
  }
  // A prerelease of the latest version.
  return { text: 'behind the latest release', major: false };
}

type TargetKey = 'major' | 'minor' | 'patch';

/**
 * The releases to offer an update to, newest first: the newest major, the newest release in the
 * installed major, and the newest patch of the installed minor, each only when newer than the
 * installed version. When the package manager only installs releases older than a minimum age, as
 * Storybook's upgrade also respects, each is the newest one old enough or exempt from it. When the
 * registry gives no publish time for the latest release, as some private registries don't, the
 * install decides.
 *
 * @param versions The installed and latest versions, publish times, and the minimum release age.
 *
 * @returns The targets that apply.
 */
function updateTargets(versions: CliVersions & { installed: string; latest: string }) {
  const { installed, latest, published = {}, minimumAge, exempt = [] } = versions;
  const cutoff = minimumAge && published[latest] ? Date.now() - minimumAge : undefined;
  const newer = [...new Set([latest, ...Object.keys(published)])]
    .filter(
      (version) =>
        semver.valid(version) &&
        !semver.prerelease(version) &&
        semver.gt(version, installed) &&
        semver.lte(version, latest) &&
        (cutoff === undefined ||
          Date.parse(published[version]) <= cutoff ||
          exempt.some((range) => semver.satisfies(version, range)))
    )
    .sort(semver.rcompare);
  const sameMajor = (version: string) => semver.major(version) === semver.major(installed);
  const sameMinor = (version: string) =>
    sameMajor(version) && semver.minor(version) === semver.minor(installed);
  const targets: { key: TargetKey; version: string | undefined }[] = [
    { key: 'major', version: newer.find((version) => !sameMajor(version)) },
    { key: 'minor', version: newer.find((version) => sameMajor(version) && !sameMinor(version)) },
    { key: 'patch', version: newer.find((version) => sameMinor(version)) },
  ];
  return targets.filter(
    (target): target is { key: TargetKey; version: string } => !!target.version
  );
}

// Releases for x.0.0 start at v8.0.0; earlier majors are only in the changelog.
const releaseNotes = (major: number) =>
  major >= 8
    ? `https://github.com/chromaui/chromatic-cli/releases/tag/v${major}.0.0`
    : 'https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md';

/**
 * The warning shown before an update across major versions, with each one's release notes.
 *
 * @param installed The installed version.
 * @param target The version to update to.
 *
 * @returns The warning.
 */
function majorWarning(installed: string, target: string) {
  const majors: number[] = [];
  for (let major = semver.major(installed) + 1; major <= semver.major(target); major += 1) {
    majors.push(major);
  }
  const notes = majors.map((major) => `${major}.0.0: ${releaseNotes(major)}`);
  return [
    "Major versions can include breaking changes that doctor doesn't fix automatically. Read what changed in each one before you update:",
    ...notes,
  ].join('\n');
}

/**
 * The fix that sets chromatic's range in package.json and installs it.
 *
 * @param key The target, such as major, which names the fix for --apply.
 * @param wanted The new range, such as ^18.15.3.
 * @param packageJsonPath The package.json that lists chromatic.
 *
 * @returns The fix.
 */
function updateFix(key: TargetKey, wanted: string, packageJsonPath: string): Fix {
  return {
    id: `chromatic.update:${key}`,
    summary: `Update chromatic to ${wanted} in package.json and install it`,
    install: true,
    edits: [
      packageJsonEdit(packageJsonPath, (json) => {
        for (const field of ['dependencies', 'devDependencies']) {
          if (json[field]?.chromatic) json[field].chromatic = wanted;
        }
      }),
    ],
  };
}

const LABELS: Record<TargetKey, string> = {
  major: 'Major update to',
  minor: 'Minor update to',
  patch: 'Patch update to',
};

/**
 * What to do about a range doctor doesn't rewrite.
 *
 * @param range The chromatic version range in package.json.
 *
 * @returns The advice.
 */
function unrewritableAdvice(range: string) {
  // A workspace or catalog version is defined elsewhere.
  return /^(workspace|catalog):/.test(range)
    ? `Update chromatic ${range} where it's defined, then run your install.`
    : `Doctor only updates a range such as ^1.2.3, ~1.2.3 or 1.2.3, so change chromatic ${range} in package.json yourself, then run your install.`;
}

/**
 * What doctor offers for a chromatic behind the latest release: one fix per update target, keeping
 * how the range pins versions, such as ^ or ~. In a terminal, doctor asks which one to apply, if
 * any. --yes applies the minor or patch update and never crosses a major, so when a major update
 * is the only one, it's a question --yes skips.
 *
 * @param targets The update targets, from updateTargets.
 * @param range The chromatic version range in package.json.
 * @param packageJsonPath The package.json that lists chromatic.
 * @param installed The installed version.
 *
 * @returns The fix, or what to do instead.
 */
function updateOffer(
  targets: ReturnType<typeof updateTargets>,
  range: string,
  packageJsonPath: string,
  installed: string
): { advice?: string; fix?: Fix } {
  // Other specifiers, such as workspace: or a catalog, are defined elsewhere, so doctor only says
  // what to change.
  const prefix = /^([\^~]?)\d+\.\d+\.\d+$/.exec(range)?.[1];
  if (prefix === undefined) return { advice: unrewritableAdvice(range) };
  const floor = semver.minVersion(range)?.version ?? installed;
  if (semver.major(floor) > semver.major(installed)) {
    // package.json already asks for a newer major; the install hasn't caught up.
    return { advice: `package.json already asks for ${range}. Run your install to update it.` };
  }
  const offered = targets.filter(
    (target, index) =>
      semver.gt(target.version, floor) &&
      // A range that also matches a newer target, such as ^18.10.2 for 18.15.3, installs that one.
      !targets
        .slice(0, index)
        .some((newer) => semver.satisfies(newer.version, `${prefix}${target.version}`))
  );
  if (offered.length === 0) {
    return { advice: `package.json already asks for ${range}. Run your install to update it.` };
  }
  const choices: FixChoice[] = offered.map(({ key, version }) => ({
    key,
    label: `${LABELS[key]} ${version}`,
    ...(key === 'major' && { warning: majorWarning(installed, version) }),
    fix: updateFix(key, `${prefix}${version}`, packageJsonPath),
  }));
  const [first] = choices;
  if (choices.length === 1 && !first.warning) return { fix: first.fix };
  const safe = choices.find((choice) => !choice.warning);
  return {
    fix: safe
      ? { ...safe.fix, choices }
      : { ...first.fix, question: `${first.label}, a new major version?`, choices },
  };
}

/**
 * What the release-age gate holds back.
 *
 * @param minimumAge How old a release must be, in milliseconds.
 * @param exempt Ranges of versions the package manager installs whatever their age.
 * @param target The newest version the package manager installs, if any is newer.
 *
 * @returns The sentence.
 */
function gateSentence(minimumAge: number, exempt: string[] = [], target?: string) {
  const exempted = exempt.length > 0 ? ', or ones it exempts' : '';
  const gate = `Your package manager only installs releases at least ${duration(minimumAge)} old${exempted}`;
  return target
    ? `${gate}, so the newest one it installs is ${target}.`
    : `${gate}, so there's nothing newer to update to yet.`;
}

/**
 * What the Project line says about updating, and the fix: the latest release, any release-age gate
 * that holds it back, the release notes for a major update, and the update targets.
 *
 * @param versions The installed and latest versions, publish times, and the minimum release age.
 * @param range The chromatic version range in package.json.
 * @param packageJsonPath The package.json that lists chromatic.
 *
 * @returns The check's detail and fix.
 */
function updateDetail(
  versions: CliVersions & { installed: string; latest: string },
  range: string,
  packageJsonPath: string
) {
  const { installed, latest, minimumAge = 0, exempt } = versions;
  const targets = updateTargets(versions);
  const lines = [`The latest release is ${latest}.`];
  if (targets[0]?.version !== latest && minimumAge) {
    lines.push(gateSentence(minimumAge, exempt, targets[0]?.version));
  }
  const { advice, fix } =
    targets.length > 0 ? updateOffer(targets, range, packageJsonPath, installed) : {};
  if (advice) lines.push(advice);
  // Last, since its links each take a line.
  const major = targets.find((target) => target.key === 'major');
  if (major) lines.push(majorWarning(installed, major.version));
  return { detail: lines.join(' '), fix };
}

/**
 * The Project line for the installed chromatic, when package.json lists it and doctor read its
 * versions.
 *
 * @param versions The installed and latest versions, from readCliVersions.
 * @param range The chromatic version range in package.json.
 * @param packageJsonPath The package.json that lists chromatic.
 *
 * @returns The check, or none.
 */
export function cliVersionChecks(
  versions: CliVersions | undefined,
  range: string | undefined,
  packageJsonPath: string
): Check[] {
  return versions && range ? [cliVersionCheck(versions, range, packageJsonPath)] : [];
}

/**
 * The Project line for the installed chromatic: how far behind the latest release it is, with a fix
 * that updates package.json, or why doctor couldn't tell.
 *
 * @param versions The installed and latest versions, from readCliVersions.
 * @param range The chromatic version range in package.json.
 * @param packageJsonPath The package.json that lists chromatic.
 *
 * @returns The check.
 */
function cliVersionCheck(versions: CliVersions, range: string, packageJsonPath: string): Check {
  const { installed, latest, noLatest } = versions;
  if (!installed) {
    return {
      group: 'Loading',
      status: 'info',
      title: "chromatic isn't installed here",
      detail: `Run your install to get chromatic ${range}. ${latest ? `The latest release is ${latest}.` : noLatest}`,
    };
  }
  if (!latest) {
    return {
      group: 'Loading',
      status: 'info',
      title: `chromatic ${installed} is installed`,
      detail: noLatest,
    };
  }
  if (semver.eq(installed, latest)) {
    return {
      group: 'Loading',
      status: 'pass',
      title: `chromatic ${installed} is installed, the latest release`,
    };
  }
  if (semver.gt(installed, latest)) {
    return {
      group: 'Loading',
      status: 'pass',
      title: `chromatic ${installed} is installed, newer than the latest release`,
      detail: `The latest release is ${latest}.`,
    };
  }
  const gap = behind(installed, latest);
  return {
    group: 'Loading',
    // A build warns about an older major version too.
    status: gap.major ? 'warn' : 'info',
    title: `chromatic ${installed} is installed, ${gap.text}`,
    ...updateDetail({ ...versions, installed, latest }, range, packageJsonPath),
  };
}
