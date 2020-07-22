import { writeFile } from 'jsonfile';
import { confirm } from 'node-ask';

import addedScript from '../ui/messages/info/addedScript';
import notAddedScript from '../ui/messages/info/notAddedScript';
import scriptNotFound from '../ui/messages/warnings/scriptNotFound';

const scriptName = 'chromatic';

const findScript = scripts =>
  scripts[scriptName] || Object.values(scripts).find(cmd => cmd.startsWith(scriptName));

export default async function checkPackageJson({ log, options, packageJson, packagePath }) {
  if (!options.interactive) return;

  try {
    const json = { ...packageJson };
    if (!json.scripts) json.scripts = {};
    if (findScript(json.scripts)) return;

    const scriptCommand = `${`npx chromatic ${options.originalArgv.slice(2).join(' ')}`
      .replace(/--project-token[= ]\S+/, '')
      .replace(/--app-code[= ]\S+/, '')
      .trim()} --project-token ${options.projectToken}`;

    log.info('');
    if (await confirm(scriptNotFound(scriptName))) {
      json.scripts[scriptName] = scriptCommand;
      await writeFile(packagePath, json, { spaces: 2 });
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
