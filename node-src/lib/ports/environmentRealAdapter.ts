import envCi from 'env-ci';

import { Environment } from './environment';

/**
 * Construct the production {@link Environment} backed by `process.env`,
 * `process.cwd()`, and the `env-ci` package for CI-service detection.
 *
 * @returns An Environment that reads the live host environment.
 */
export function createRealEnvironment(): Environment {
  return {
    get: (key: string) => process.env[key],
    all: () => ({ ...process.env }),
    cwd: () => process.cwd(),
    platform: () => process.platform,
    nodeVersion: () => process.versions.node,
    ci: () => {
      try {
        const result = envCi() as { service?: string };
        return result.service;
      } catch {
        return undefined;
      }
    },
  };
}
