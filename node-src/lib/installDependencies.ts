import { getCliCommand, parseNi } from '@antfu/ni';

import { runCommand } from './shell/shell';

/**
 * Install dependencies using the package manager specified in the project's package.json.
 *
 * @returns A promise that resolves when the command completes.
 */
export async function installDependencies() {
  const command = await getCliCommand(parseNi, [], { programmatic: true });
  if (!command) {
    throw new Error('Unable to determine the package manager install command');
  }

  return runCommand(command);
}
