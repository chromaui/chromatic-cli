import path from 'path';

import { posix } from './posix';

/**
 * Get the absolute Storybook project root. This is where you run Storybook from, NOT the config dir.
 * It is the directory the builder writes its own paths relative to.
 *
 * Without an override the project root is simply where you run the CLI:
 * /repo               <-- git root
 * /repo/packages/ui   <-- project root, named by --storybook-base-dir
 *
 * This is the only derivation of the project root. Callers that need a relative representation
 * derive it at their interface by passing this result to `relativeTo`.
 *
 * @param input The base directory configured by the user (if any) and the git
 *   root path discovered by gitInfo.
 * @param input.storybookBaseDir User-supplied base directory override, relative to the git root.
 * @param input.gitRootPath Absolute path of the git project root.
 *
 * @returns The absolute Storybook project root.
 */
export function getStorybookProjectRoot({
  storybookBaseDir,
  gitRootPath,
}: {
  storybookBaseDir?: string;
  gitRootPath?: string;
}) {
  return storybookBaseDir
    ? path.resolve(gitRootPath ?? process.cwd(), storybookBaseDir)
    : process.cwd();
}

/**
 * Rewrites an absolute directory as a posix path relative to the given root.
 *
 * @param root The absolute directory the result is relative to.
 * @param directory The absolute directory to rewrite.
 *
 * @returns The relative posix path.
 */
export function relativeTo(root: string, directory: string) {
  return posix(path.relative(root, directory));
}
