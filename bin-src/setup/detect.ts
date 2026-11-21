import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { getPackageManagerName } from '../../node-src/lib/getPackageManager';
import { findConfigFlags, MAIN_CONFIG_PATTERN } from '../../node-src/lib/getStorybookMetadata';
import { readJson, relativeOrDot } from './shared';

export type Framework = 'storybook' | 'playwright' | 'cypress' | 'vitest';

const FRAMEWORK_NAMES: Record<Framework, string> = {
  storybook: 'Storybook',
  playwright: 'Playwright',
  cypress: 'Cypress',
  vitest: 'Vitest',
};

export interface Project {
  framework: Framework;
  /** Absolute directory Chromatic should run from: the package that owns the tests. */
  directory: string;
  /** Path from the repository root, for display. */
  relative: string;
  packageName?: string;
  storybookVersion?: string;
  /** Storybook framework package without the @storybook/ prefix, such as react-vite. */
  storybookFramework?: string;
  /** The file that gave the project away, such as packages/ui/.storybook/main.ts. */
  evidence: string;
}

const STORYBOOK_MAIN = /(^|\/)\.storybook\/main\.[cm]?[jt]sx?$/;
const E2E_CONFIG = /(^|\/)(playwright|cypress|vitest)\.config\.[cm]?[jt]s$/;

// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function versionOf(directory: string, gitRoot: string, name: string) {
  for (let current = directory; current.startsWith(gitRoot); current = path.dirname(current)) {
    const installed = readJson(path.join(current, 'node_modules', name, 'package.json'));
    if (installed?.version) return installed.version as string;
    const pkg = readJson(path.join(current, 'package.json'));
    const declared = pkg?.devDependencies?.[name] ?? pkg?.dependencies?.[name];
    if (declared) return String(declared).replace(/^[\^~]/, '');
    if (current === gitRoot) break;
  }
  return undefined;
}

/**
 * Each Storybook's main config, keyed by the package directory it runs from: .storybook/main.*
 * next to it, or the folder a build script passes to -c, as the main command reads it.
 *
 * @param gitRoot Absolute repository root.
 * @param present Repository files that exist, relative to the root.
 *
 * @returns Main config files by package directory, both relative to the root.
 */
function storybookMains(gitRoot: string, present: Set<string>) {
  const mains = new Map<string, string>();
  for (const file of present) {
    if (STORYBOOK_MAIN.test(file)) mains.set(path.dirname(path.dirname(file)), file);
  }
  for (const file of [...present].filter((f) => path.basename(f) === 'package.json')) {
    const directory = path.dirname(file);
    if (mains.has(directory)) continue;
    const packageJson = readJson(path.join(gitRoot, file)) ?? {};
    const scripts: Record<string, string> = packageJson.scripts ?? {};
    const configDirectories = new Set(
      Object.keys(scripts)
        .filter((name) => /\b(storybook build|build-storybook)\b/.test(scripts[name]))
        .map((buildScriptName) => findConfigFlags({ buildScriptName, packageJson }).configDir)
        .filter((configDirectory) => configDirectory !== undefined)
        .map((configDirectory) => path.join(directory, configDirectory))
    );
    const main = [...present].find(
      (f) => configDirectories.has(path.dirname(f)) && MAIN_CONFIG_PATTERN.test(path.basename(f))
    );
    if (main) mains.set(directory, main);
  }
  return mains;
}

function storybookProject(gitRoot: string, relative: string, file: string): Project {
  const directory = path.join(gitRoot, relative);
  const main = readFileSync(path.join(gitRoot, file), 'utf8');
  const framework = main.match(/framework\s*:\s*(?:\{\s*name\s*:\s*)?['"]([^'"]+)['"]/)?.[1];
  return {
    framework: 'storybook',
    directory,
    relative: relativeOrDot(gitRoot, directory),
    packageName: readJson(path.join(directory, 'package.json'))?.name,
    storybookVersion: versionOf(directory, gitRoot, 'storybook'),
    storybookFramework: framework?.replace(/^@storybook\//, ''),
    evidence: file,
  };
}

/**
 * Finds every Storybook and E2E test setup in the repository from files git doesn't ignore.
 *
 * @param gitRoot Absolute repository root.
 * @param files Repository files relative to the root.
 *
 * @returns One project per Storybook config directory or E2E config file.
 */
export function findProjects(gitRoot: string, files: string[]): Project[] {
  const projects: Project[] = [];
  // git lists deleted files until the deletion is staged.
  const present = new Set(files.filter((f) => existsSync(path.join(gitRoot, f))));

  for (const [relative, file] of storybookMains(gitRoot, present)) {
    projects.push(storybookProject(gitRoot, relative, file));
  }

  for (const file of [...present].filter((f) => E2E_CONFIG.test(f))) {
    const framework = file.match(E2E_CONFIG)?.[2] as Framework;
    const directory = path.join(gitRoot, path.dirname(file));
    // A vitest.config next to a Storybook is usually the Storybook's own test setup.
    if (framework === 'vitest' && projects.some((p) => p.directory === directory)) continue;
    projects.push({
      framework,
      directory,
      relative: relativeOrDot(gitRoot, directory),
      packageName: readJson(path.join(directory, 'package.json'))?.name,
      evidence: file,
    });
  }

  return projects;
}

/**
 * Describes a project for prompts and headings, such as "Storybook 10.6 (react-vite)".
 *
 * @param project The detected project.
 *
 * @returns The description.
 */
export function describeProject(project: Project) {
  if (project.framework !== 'storybook') return `${FRAMEWORK_NAMES[project.framework]} tests`;
  const version = project.storybookVersion?.match(/^\d+\.\d+/)?.[0];
  return [
    `Storybook${version ? ` ${version}` : ''}`,
    project.storybookFramework && `(${project.storybookFramework})`,
  ]
    .filter(Boolean)
    .join(' ');
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'yarn-classic' | 'bun';

// Lockfiles at the repository root, so a run from inside a workspace package finds the same answer.
const ROOT_LOCKFILES: [string, string][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['pnpm-workspace.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
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
  if (name.startsWith('bun')) return 'bun';
  if (name.startsWith('yarn')) return yarnFlavor(name, gitRoot);
  return 'npm';
}

export const PACKAGE_MANAGER_COMMANDS: Record<
  PackageManager,
  { label: string; ciInstall: string; addDev: string[]; run: (script: string) => string }
> = {
  npm: {
    label: 'npm',
    ciInstall: 'npm ci',
    addDev: ['npm', 'install', '--save-dev'],
    run: (s) => `npm run ${s}`,
  },
  pnpm: {
    label: 'pnpm',
    ciInstall: 'pnpm install --frozen-lockfile',
    addDev: ['pnpm', 'add', '--save-dev'],
    run: (s) => `pnpm ${s}`,
  },
  yarn: {
    label: 'Yarn',
    ciInstall: 'yarn install --immutable',
    addDev: ['yarn', 'add', '--dev'],
    run: (s) => `yarn ${s}`,
  },
  'yarn-classic': {
    label: 'Yarn 1',
    ciInstall: 'yarn install --frozen-lockfile',
    addDev: ['yarn', 'add', '--dev'],
    run: (s) => `yarn ${s}`,
  },
  bun: {
    label: 'Bun',
    ciInstall: 'bun install --frozen-lockfile',
    addDev: ['bun', 'add', '--dev'],
    run: (s) => `bun run ${s}`,
  },
};

export interface CiProvider {
  id: string;
  name: string;
  patterns: RegExp[];
  docs: string;
  secretHelp: string;
}

export const CI_PROVIDERS: CiProvider[] = [
  {
    id: 'github',
    name: 'GitHub Actions',
    patterns: [/^\.github\/workflows\/[^/]+\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/github-actions',
    secretHelp: 'gh secret set CHROMATIC_PROJECT_TOKEN',
  },
  {
    id: 'gitlab',
    name: 'GitLab Pipelines',
    patterns: [/^\.gitlab-ci\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/gitlab',
    secretHelp: 'Settings → CI/CD → Variables, masked',
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket Pipelines',
    patterns: [/^bitbucket-pipelines\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/bitbucket-pipelines',
    secretHelp: 'Repository settings → Repository variables, secured',
  },
  {
    id: 'circleci',
    name: 'CircleCI',
    patterns: [/^\.circleci\/config\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/circleci',
    secretHelp: 'Project settings → Environment variables',
  },
  {
    id: 'travis',
    name: 'Travis CI',
    patterns: [/^\.travis\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/travisci',
    secretHelp: 'Repository settings → Environment variables',
  },
  {
    id: 'jenkins',
    name: 'Jenkins',
    patterns: [/^Jenkinsfile$/],
    docs: 'https://www.chromatic.com/docs/jenkins',
    secretHelp: 'a Jenkins credential exposed as an environment variable',
  },
  {
    id: 'azure',
    name: 'Azure Pipelines',
    patterns: [/^azure-pipelines\.ya?ml$/, /^\.azure-pipelines\/.+\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/azure-pipelines',
    secretHelp: 'Pipeline → Variables, kept secret',
  },
  {
    id: 'semaphore',
    name: 'Semaphore',
    patterns: [/^\.semaphore\/[^/]+\.ya?ml$/],
    docs: 'https://www.chromatic.com/docs/semaphore',
    secretHelp: 'Organization settings → Secrets',
  },
];

export const OTHER_CI: CiProvider = {
  id: 'other',
  name: "Other / I'll set it up myself",
  patterns: [],
  docs: 'https://www.chromatic.com/docs/custom-ci-provider',
  secretHelp: "your CI's secret settings",
};
