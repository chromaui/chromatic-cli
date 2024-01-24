import jsonfile from 'jsonfile';
import { confirm } from 'node-ask';

import { Context } from '..';
import addedScript from '../ui/messages/info/addedScript';
import notAddedScript from '../ui/messages/info/notAddedScript';
import scriptNotFound from '../ui/messages/warnings/scriptNotFound';

const { writeFile } = jsonfile;

const scriptName = 'chromatic';

const findScript = (scripts: Record<string, string>) =>
  scripts[scriptName] || Object.values(scripts).find((cmd) => cmd.startsWith(scriptName));

export default async function checkPackageJson({
  log,
  options,
  packageJson,
  packagePath,
}: Context) {
  if (!options.interactive) return;

  try {
    const { readme, _id, ...json } = packageJson;
    if (!json.scripts) json.scripts = {};
    if (findScript(json.scripts)) return;

    const scriptCommand = `npx chromatic ${options.originalArgv.join(' ')}`;

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
