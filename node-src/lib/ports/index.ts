import { Logger } from '../log';
import { GitRepository } from './git';
import { createShellGitAdapter } from './gitShellAdapter';

/**
 * The collection of external-dependency boundaries ("ports") used by the
 * Chromatic CLI domain code. Each field is filled in by a dedicated
 * port-extraction PR as part of an ongoing refactoring project to eliminate
 * the context god object.
 */
export interface Ports {
  git: GitRepository;
}

interface DefaultPortsDeps {
  log: Logger;
}

/**
 * Construct the production `Ports` bundle with real adapters wired up.
 *
 * @param deps Shared runtime dependencies the adapters need.
 * @param deps.log The logger forwarded to adapters that need it.
 *
 * @returns A `Ports` record wired with production adapters.
 */
export function createDefaultPorts(deps: DefaultPortsDeps): Ports {
  return {
    git: createShellGitAdapter({ log: deps.log }),
  };
}
