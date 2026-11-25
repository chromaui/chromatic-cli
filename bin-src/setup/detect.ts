import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findConfigFlags, MAIN_CONFIG_PATTERN } from '../../node-src/lib/getStorybookMetadata';
import type { PackageManager } from './install';
import { forEachRepoFile, readJson, relativeOrDot } from './shared';

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
  directory: string;
  /** Path from the repository root, for display. */
  relative: string;
  packageName?: string;
  storybookVersion?: string;
  /** Storybook framework package without the `@storybook/` prefix, such as react-vite. */
  storybookFramework?: string;
  /** The file that gave the project away, such as packages/ui/.storybook/main.ts. */
  evidence: string;
}

const STORYBOOK_MAIN = /(^|\/)\.storybook\/main\.[cm]?[jt]sx?$/;
export const E2E_CONFIG = /(^|\/)(playwright|cypress|vitest)\.config\.[cm]?[jt]s$/;

export type TestFramework = Exclude<Framework, 'storybook'>;
export const TEST_FRAMEWORKS: TestFramework[] = ['vitest', 'playwright', 'cypress'];

// Where each framework's Chromatic package writes its archives, from the folder its config is in.
// `chromatic --<framework>` looks for them there from the folder it runs in, unless
// CHROMATIC_ARCHIVE_LOCATION says otherwise.
export const ARCHIVE_DIRECTORIES: Record<TestFramework, string> = {
  vitest: '.vitest/chromatic',
  playwright: 'test-results',
  cypress: 'cypress/downloads',
};

/**
 * Folders from a directory up to the repository root, nearest first. Outside a repository, only the
 * directory, so doctor never reads above a project it can't place.
 *
 * @param directory Where to start.
 * @param gitRoot The repository root.
 *
 * @returns The folders.
 */
function foldersUp(directory: string, gitRoot?: string) {
  const folders = [directory];
  for (let current = directory; gitRoot && current !== gitRoot; ) {
    const parent = path.dirname(current);
    if (parent === current || !directory.startsWith(`${gitRoot}${path.sep}`)) break;
    folders.push((current = parent));
  }
  return folders;
}

function isTestConfig(framework: TestFramework, folder: string, file: string) {
  if (file.match(E2E_CONFIG)?.[2] === framework) return true;
  if (framework !== 'vitest') return false;
  // Vitest 3 also reads a workspace file, and any Vitest reads vite.config.
  if (/^vitest\.workspace\.([cm]?[jt]s|json)$/.test(file)) return true;
  return (
    /^vite\.config\.[cm]?[jt]s$/.test(file) &&
    readFileSync(path.join(folder, file), 'utf8').includes('chromaticPlugin')
  );
}

/**
 * Finds the config of the test framework a project runs, in its folder or one above it up to the
 * repository root. The framework runs from that config's folder and writes its archives there.
 *
 * @param framework The test framework.
 * @param directory The project's folder.
 * @param gitRoot The repository root.
 *
 * @returns The config's absolute path, or undefined.
 */
export function findTestConfig(framework: TestFramework, directory: string, gitRoot?: string) {
  for (const folder of foldersUp(directory, gitRoot)) {
    const file = readdirSync(folder).find((name) => isTestConfig(framework, folder, name));
    if (file) return path.join(folder, file);
  }
  return undefined;
}

/**
 * The nearest folder above a project where its tests or Storybook run, such as a repo-root
 * Playwright config or .storybook that covers every package. With a test framework's flag, only
 * that framework counts; with Storybook, only a .storybook.
 *
 * @param directory The folder doctor would check.
 * @param gitRoot The repository root.
 * @param flagged The framework the options name, if any.
 *
 * @returns The folder and what runs there, or undefined.
 */
export function runsAbove(directory: string, gitRoot: string | undefined, flagged?: Framework) {
  for (const folder of foldersUp(directory, gitRoot).slice(1)) {
    const tests = flagged ? TEST_FRAMEWORKS.filter((f) => f === flagged) : TEST_FRAMEWORKS;
    const framework = tests.find((f) => findTestConfig(f, folder));
    if (framework) {
      const config = findTestConfig(framework, folder) ?? folder;
      return {
        folder,
        framework,
        what: `${FRAMEWORK_NAMES[framework]} runs`,
        file: path.basename(config),
      };
    }
    const storybook = path.join(folder, '.storybook');
    if (
      (!flagged || flagged === 'storybook') &&
      existsSync(storybook) &&
      readdirSync(storybook).some((f) => MAIN_CONFIG_PATTERN.test(f))
    ) {
      return {
        folder,
        framework: 'storybook' as const,
        what: 'Storybook builds',
        file: '.storybook',
      };
    }
  }
  return undefined;
}

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
  // Every main config by its folder, so a -c folder is one lookup rather than a scan per package.
  const mainsByFolder = new Map<string, string>();
  for (const file of present) {
    if (STORYBOOK_MAIN.test(file)) mains.set(path.dirname(path.dirname(file)), file);
    if (MAIN_CONFIG_PATTERN.test(path.basename(file))) mainsByFolder.set(path.dirname(file), file);
  }
  for (const file of [...present].filter((f) => path.basename(f) === 'package.json')) {
    const directory = path.dirname(file);
    if (mains.has(directory)) continue;
    const packageJson = readJson(path.join(gitRoot, file)) ?? {};
    const scripts: Record<string, string> = packageJson.scripts ?? {};
    const main = Object.keys(scripts)
      .filter((name) => /\b(storybook build|build-storybook)\b/.test(scripts[name]))
      .map((buildScriptName) => findConfigFlags({ buildScriptName, packageJson }).configDir)
      .filter((configDirectory) => configDirectory !== undefined)
      .map((configDirectory) => mainsByFolder.get(path.join(directory, configDirectory)))
      .find((found) => found !== undefined);
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
 * The repository files that can make a project: package.json files, Storybook main configs and E2E
 * test configs. Only these are kept, so a large repository's file list isn't.
 *
 * @param gitRoot Absolute repository root.
 *
 * @returns The files, relative to the root.
 */
export async function listProjectFiles(gitRoot: string) {
  const files: string[] = [];
  await forEachRepoFile(gitRoot, (file) => {
    const name = path.basename(file);
    if (name === 'package.json' || MAIN_CONFIG_PATTERN.test(name) || E2E_CONFIG.test(file)) {
      files.push(file);
    }
  });
  return files;
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

export const PACKAGE_MANAGER_COMMANDS: Record<
  PackageManager,
  { label: string; run: (script: string) => string; dlx: string }
> = {
  npm: {
    label: 'npm',
    run: (s) => `npm run ${s}`,
    dlx: 'npx',
  },
  pnpm: {
    label: 'pnpm',
    run: (s) => `pnpm ${s}`,
    dlx: 'pnpm dlx',
  },
  yarn: {
    label: 'Yarn',
    run: (s) => `yarn ${s}`,
    dlx: 'yarn dlx',
  },
  'yarn-classic': {
    label: 'Yarn 1',
    run: (s) => `yarn ${s}`,
    dlx: 'npx',
  },
};
