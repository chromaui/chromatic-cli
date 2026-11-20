import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { getPackageManagerName } from '../../node-src/lib/getPackageManager';
import { readJson, relativeOrDot } from './shared';

export type Framework = 'storybook' | 'playwright' | 'cypress' | 'vitest';

export const FRAMEWORK_NAMES: Record<Framework, string> = {
  storybook: 'Storybook',
  playwright: 'Playwright',
  cypress: 'Cypress',
  vitest: 'Vitest',
};

export interface Project {
  framework: Framework;
  /** Absolute directory Chromatic should run from: the package that owns the tests. */
  dir: string;
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

function versionOf(dir: string, gitRoot: string, name: string) {
  for (let current = dir; current.startsWith(gitRoot); current = path.dirname(current)) {
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
 * Finds every Storybook and E2E test setup in the repository from files git doesn't ignore.
 *
 * @param gitRoot Absolute repository root.
 * @param files Repository files relative to the root.
 *
 * @returns One project per Storybook config directory or E2E config file.
 */
export function findProjects(gitRoot: string, files: string[]): Project[] {
  const projects: Project[] = [];

  for (const file of files.filter((f) => STORYBOOK_MAIN.test(f))) {
    const dir = path.join(gitRoot, path.dirname(path.dirname(file)));
    const main = readFileSync(path.join(gitRoot, file), 'utf8');
    const framework = main.match(/framework\s*:\s*(?:\{\s*name\s*:\s*)?['"]([^'"]+)['"]/)?.[1];
    projects.push({
      framework: 'storybook',
      dir,
      relative: relativeOrDot(gitRoot, dir),
      packageName: readJson(path.join(dir, 'package.json'))?.name,
      storybookVersion: versionOf(dir, gitRoot, 'storybook'),
      storybookFramework: framework?.replace(/^@storybook\//, ''),
      evidence: file,
    });
  }

  for (const file of files.filter((f) => E2E_CONFIG.test(f))) {
    const framework = file.match(E2E_CONFIG)?.[2] as Framework;
    const dir = path.join(gitRoot, path.dirname(file));
    // A vitest.config next to a Storybook is usually the Storybook's own test setup.
    if (framework === 'vitest' && projects.some((p) => p.dir === dir)) continue;
    projects.push({
      framework,
      dir,
      relative: relativeOrDot(gitRoot, dir),
      packageName: readJson(path.join(dir, 'package.json'))?.name,
      evidence: file,
    });
  }

  return projects;
}

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

export async function detectPackageManager(gitRoot: string): Promise<PackageManager> {
  const declared = readJson(path.join(gitRoot, 'package.json'))?.packageManager as
    | string
    | undefined;
  const fromRoot = ROOT_LOCKFILES.find(([file]) => existsSync(path.join(gitRoot, file)))?.[1];
  const name =
    declared ?? fromRoot ?? (await getPackageManagerName().catch(() => undefined)) ?? 'npm';
  if (name.startsWith('pnpm')) return 'pnpm';
  if (name.startsWith('bun')) return 'bun';
  if (name.startsWith('yarn')) {
    return existsSync(path.join(gitRoot, '.yarnrc.yml')) ? 'yarn' : 'yarn-classic';
  }
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

export interface DetectedCi {
  provider: CiProvider;
  files: string[];
  /** Files that already run Chromatic. */
  chromaticFiles: string[];
}

const RUNS_CHROMATIC = /chromaui\/action|\bchromatic\b(?!\.config)/i;

export function detectCi(gitRoot: string, files: string[]): DetectedCi[] {
  return CI_PROVIDERS.map((provider) => {
    const found = files.filter((file) => provider.patterns.some((p) => p.test(file)));
    const chromaticFiles = found.filter((file) =>
      RUNS_CHROMATIC.test(readFileSync(path.join(gitRoot, file), 'utf8'))
    );
    return { provider, files: found, chromaticFiles };
  });
}

/**
 * The CI files that run Chromatic for one package. A file counts for a package in a subdirectory
 * when it names that directory (workingDir, working-directory or cd), and for the repository root
 * when it names no directory. A heuristic: it reads the text, not the pipeline.
 *
 * @param detected Results from detectCi.
 * @param gitRoot Absolute repository root.
 * @param packageDir The package's path from the repository root, or '.'.
 *
 * @returns Each matching file with its provider.
 */
export function chromaticRunsFor(detected: DetectedCi[], gitRoot: string, packageDir: string) {
  const normalized = packageDir.replace(/^\.\//, '').replace(/\/$/, '');
  return detected.flatMap(({ provider, chromaticFiles }) =>
    chromaticFiles
      .filter((file) => {
        const text = readFileSync(path.join(gitRoot, file), 'utf8').replaceAll(
          /(^|\s)#.*$/gm,
          '$1'
        );
        if (normalized === '.') return !/workingDir:|working-directory:|\bcd\s+\S/.test(text);
        return text.includes(normalized);
      })
      .map((file) => ({ provider, file }))
  );
}
