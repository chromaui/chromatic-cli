import * as fs from 'fs';
import * as path from 'path';
import { invalidStorybookBaseDir } from '../ui/messages/errors/invalidStorybookBaseDir';
import { Context, Stats } from '../types';
import pLimit from 'p-limit';
import { exitCodes, setExitCode } from './setExitCode';

export async function checkStorybookBaseDir(ctx: Context, stats: Stats) {
  ctx.log.warn('ctx.options:', ctx.options);
  const { storybookBaseDir } = ctx.options;
  // ctx.log.debug('Storybook base directory:', storybookBaseDir);

  return;

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
          const absolutePath = path.join(storybookBaseDir || '', file.name);
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
  } catch (err) {
    ctx.log.debug('No modules from stats file found in:', storybookBaseDir);
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
    throw new Error(invalidStorybookBaseDir());
  }
}
