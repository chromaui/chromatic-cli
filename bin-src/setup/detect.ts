import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findConfigFlags, MAIN_CONFIG_PATTERN } from '../../node-src/lib/getStorybookMetadata';
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
