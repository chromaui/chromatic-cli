import { parseNi, run } from '@antfu/ni';

/**
 * Install dependencies using the package manager specified in the project's package.json.
 *
 * @returns A promise that resolves when the command completes.
 */
export function installDependencies() {
  return run(parseNi, [], { programmatic: true });
}
