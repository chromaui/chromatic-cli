import path from 'path';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'jsonfile';

export function checkPackageJson({ command, script, appDir = process.cwd() } = {}) {
  const packageJson = readFileSync(path.resolve(appDir, './package.json'));

  return Object.entries(packageJson.scripts || {}).find(
    ([key, value]) => value.match(command) || key === script
  );
}

export function addScriptToPackageJson(scriptName, scriptCommand, { appDir = process.cwd() } = {}) {
  const filename = path.resolve(appDir, './package.json');
  const packageJson = readFileSync(filename);

  if (packageJson[scriptName]) {
    throw new Error(`Script named '${scriptName}' already exists in package.json`);
  }

  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }
  packageJson.scripts[scriptName] = scriptCommand;

  if (!packageJson.dependencies) {
    packageJson.dependencies = {};
  }
  if (!packageJson.dependencies['cross-env']) {
    packageJson.dependencies['cross-env'] = `^${execSync('npm show cross-env version')
      .toString()
      .trim()}`;
  }
  writeFileSync(filename, packageJson, { spaces: 2 });
}
