import path from 'path';
import { readFileSync, writeFileSync } from 'jsonfile';

import { createTask } from '../lib/tasks';

const command = 'chromatic';
const script = 'chromatic';

export function checkPackageJson({ appDir = process.cwd() } = {}) {
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

  writeFileSync(filename, packageJson, { spaces: 2 });
}

const updatePackageJson = async ctx => {
  // if (!checkPackageJson() && originalArgv && !fromCI && interactive) {
  //   const scriptCommand = `${`chromatic ${originalArgv.slice(2).join(' ')}`
  //     .replace(/--project-token[= ]\S+/)
  //     .replace(/--app-code[= ]\S+/)
  //     .trim()} --project-token=${projectToken}`;
  //   const confirmed = await confirm(
  //     `\nYou have not added the 'chromatic' script to your 'package.json'. Would you like me to do it for you?`
  //   );
  //   if (confirmed) {
  //     addScriptToPackageJson('chromatic', scriptCommand);
  //     log.info(
  //       dedent`
  //         Added script 'chromatic'. You can now run it here or in CI with 'npm run chromatic' (or 'yarn chromatic')
  //         NOTE: Your project token was added to the script via the \`--project-token\` flag.
  //         The project token cannot be used to read story data, it can only be used to create new builds.
  //         If you're running Chromatic via continuous integration, we recommend setting \`CHROMATIC_PROJECT_TOKEN\` environment variable in your CI environment. You can then remove the --project-token from your 'package.json'.
  //       `
  //     );
  //   } else {
  //     log.info(
  //       dedent`
  //         No problem. You can add it later with:
  //         {
  //           "scripts": {
  //             "chromatic": "${scriptCommand}"
  //           }
  //         }
  //       `
  //     );
  //   }
  // }
};

export default createTask({
  title: 'Check package.json',
  steps: [updatePackageJson],
});
