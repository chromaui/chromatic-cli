import * as fs from 'fs';
import pLimit from 'p-limit';
import path from 'path';

import { getRepositoryRoot } from '../git/git';
import { Context, Stats } from '../types';
import { invalidStorybookBaseDirectory } from '../ui/messages/errors/invalidStorybookBaseDirectory';
import { exitCodes, setExitCode } from './setExitCode';

/**
 * Ensure the base directory for Storybook is setup correctly before running TurboSnap.
 *
 * @param ctx The context set when executing the CLI.
 * @param stats The stats file information from the project's builder (Webpack, for example).
 */
export async function checkStorybookBaseDirectory(ctx: Context, stats: Stats) {
  const repositoryRoot = await getRepositoryRoot();

  if (!repositoryRoot) {
    throw new Error('Failed to determine repository root');
  }

  // Assume CWD if no storybookBaseDir is provided
  const { storybookBaseDir: storybookBaseDirectory = path.relative(repositoryRoot, '') } =
    ctx.options;

  // Find all js(x)/ts(x) files in stats that are not in node_modules
  const sourceModuleFiles = stats.modules.filter(
    (module: any) => !module.name.includes('node_modules') && /\.(js|jsx|ts|tsx)$/.test(module.name)
  );

  // GitHub Actions seems to have a default ulimit of 1024, so we limit concurrency to stay under
  const limitConcurrency = pLimit(1000);

  // Check if any of the source module files exist in the storybookBaseDir
  try {
    await Promise.any(
      sourceModuleFiles.map((file) => {
        return limitConcurrency(() => {
          const absolutePath = path.join(repositoryRoot, storybookBaseDirectory, file.name);
          return new Promise((resolve, reject) =>
            fs.access(absolutePath, (err) => {
              if (err) {
                ctx.log.debug('Not found:', absolutePath);
                reject();
              } else {
                resolve(true);
              }
            })
          );
        });
      })
    );
  } catch {
    ctx.log.debug(`Invalid storybookBaseDir: ${storybookBaseDirectory}`);
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
    throw new Error(invalidStorybookBaseDirectory());
  }
}
