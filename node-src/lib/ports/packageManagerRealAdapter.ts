import { getCliCommand, parseNa, parseNr } from '@antfu/ni';
import { hasYarn, spawn as packageCommand } from 'yarn-or-npm';

import { PackageManager } from './packageManager';
import { ProcessRunner } from './processRunner';

function spawnAndCollect(args: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = packageCommand(args, options);
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
  });
}

/**
 * Construct the production {@link PackageManager} backed by `@antfu/ni` for
 * detection and command-string assembly, `yarn-or-npm` for direct spawning,
 * and the supplied {@link ProcessRunner} for the version probe.
 *
 * @param deps Adapter dependencies.
 * @param deps.proc The ProcessRunner that runs `<pm> --version`.
 *
 * @returns A PackageManager wired to the real package-manager helpers.
 */
export function createRealPackageManager(deps: { proc: ProcessRunner }): PackageManager {
  return {
    async detect() {
      const name = await getCliCommand(parseNa, [], { programmatic: true });
      if (!name) throw new Error('Failed to determine package manager');
      const { stdout } = await deps.proc.run(`${name} --version`);
      const [output] = (stdout?.toString() ?? '').trim().split('\n', 1);
      const version = output.trim().replace(/^v/, '');
      return { name, version };
    },
    async getRunCommand(args) {
      return getCliCommand(parseNr, args, { programmatic: true }) as Promise<string>;
    },
    async exec(args, options = {}) {
      return spawnAndCollect(args, options);
    },
    hasYarn() {
      return hasYarn();
    },
  };
}
