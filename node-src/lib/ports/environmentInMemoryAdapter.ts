import { Environment } from './environment';

/** Fixture for the in-memory {@link Environment} adapter. */
export interface InMemoryEnvironmentState {
  /** Map of env-var name → value. Entries with `undefined` values are absent. */
  vars?: Record<string, string | undefined>;
  /** Working directory returned from `cwd()`. Defaults to `'/'`. */
  cwd?: string;
  /** Platform returned from `platform()`. Defaults to `'linux'`. */
  platform?: NodeJS.Platform;
  /** Node version returned from `nodeVersion()`. Defaults to `'18.0.0'`. */
  nodeVersion?: string;
  /** CI service returned from `ci()`. Defaults to `undefined`. */
  ci?: string;
}

/**
 * Construct an in-memory {@link Environment} backed by a fixture object.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns An Environment that reads from the supplied fixture.
 */
export function createInMemoryEnvironment(state: InMemoryEnvironmentState = {}): Environment {
  return {
    get: (key) => state.vars?.[key],
    all: () => ({ ...state.vars }),
    cwd: () => state.cwd ?? '/',
    platform: () => state.platform ?? 'linux',
    nodeVersion: () => state.nodeVersion ?? '18.0.0',
    ci: () => state.ci,
  };
}
