import * as fs from 'fs';
import * as path from 'path';

export default function checkStorybookBaseDir(storybookBaseDir: string, stats: any) {
  // Find all js(x)/ts(x) files in stats that are not in node_modules
  const sourceModuleFiles = stats.modules.filter(
    (module: any) => !module.name.includes('node_modules') && /\.(js|jsx|ts|tsx)$/.test(module.name)
  );

  // Check if any of the source module files exist in the storybookBaseDir
  for (const file of sourceModuleFiles) {
    const absolutePath = path.join(storybookBaseDir, file.name);
    if (fs.existsSync(absolutePath)) {
      return true;
    }
  }

  throw new Error(
    `The storybookBaseDir configuration is incorrect. Please use the VTA to check for configuration issues.`
  );
}
