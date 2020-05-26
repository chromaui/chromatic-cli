import path from 'path';

import { readFileSync, writeFileSync } from 'jsonfile';
import { confirm } from 'node-ask';

import addedScript from '../ui/messages/info/addedScript';
import notAddedScript from '../ui/messages/info/notAddedScript';
import scriptNotFound from '../ui/messages/warnings/scriptNotFound';

const scriptName = 'chromatic';

const findScript = scripts =>
  scripts[scriptName] || Object.values(scripts).find(cmd => cmd.startsWith(scriptName));

export default async function checkPackageJson({ log, options }) {
  if (!options.interactive) return;

  try {
    const filename = path.resolve(process.cwd(), './package.json');
    const packageJson = readFileSync(filename);
    if (!packageJson.scripts) packageJson.scripts = {};
    if (findScript(packageJson.scripts)) return;

    const scriptCommand = `${`npx chromatic ${options.originalArgv.slice(2).join(' ')}`
      .replace(/--project-token[= ]\S+/, '')
      .replace(/--app-code[= ]\S+/, '')
      .trim()} --project-token=${options.projectToken}`;

    log.info('');
    if (await confirm(scriptNotFound(scriptName))) {
      packageJson.scripts[scriptName] = scriptCommand;
      writeFileSync(filename, packageJson, { spaces: 2 });
      log.info('');
      log.info(addedScript(scriptName));
    } else {
      log.info('');
      log.info(notAddedScript(scriptName, scriptCommand));
    }
  } catch (e) {
    log.warn(e);
  }
}
