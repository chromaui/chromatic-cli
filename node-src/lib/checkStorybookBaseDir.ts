import * as fs from 'fs';
import * as path from 'path';

export default function checkStorybookBaseDir(storybookBaseDir: string, stats: any) {
  const absolutePath = path.join(storybookBaseDir, stats.modules[0].name);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `The storybookBaseDir configuration is incorrect. Please use the VTA to check for configuration issues.`
    );
  }

  return true;
}
