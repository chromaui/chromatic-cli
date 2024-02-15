import * as fs from 'fs';
import * as path from 'path';
import invalidStorybookBaseDir from '../ui/messages/errors/invalidStorybookBaseDir';
import { Context, Stats } from '../types';

export default function checkStorybookBaseDir(ctx: Context, stats: Stats) {
  const { storybookBaseDir } = ctx.options;
  ctx.log.debug('Storybook base directory:', storybookBaseDir);

  // Find all js(x)/ts(x) files in stats that are not in node_modules
  const sourceModuleFiles = stats.modules.filter(
    (module: any) => !module.name.includes('node_modules') && /\.(js|jsx|ts|tsx)$/.test(module.name)
  );

  // Check if any of the source module files exist in the storybookBaseDir
  for (const file of sourceModuleFiles) {
    const absolutePath = path.join(storybookBaseDir || '', file.name);
    if (fs.existsSync(absolutePath)) {
      ctx.log.debug('Found:', absolutePath);
      return true;
    }
  }

  ctx.log.debug('No modules found in:', storybookBaseDir);
  throw new Error(invalidStorybookBaseDir());
}
