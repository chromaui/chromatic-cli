import * as Sentry from '@sentry/node';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { Logger } from '../log';

let allowed = false;

/**
 * Lets this process load a Yarn Plug'n'Play project's runtime. Only the CLI and GitHub Action entry
 * points call it. `chromatic/node` never does, so a host process such as Storybook running the
 * Visual Tests addon keeps the module resolution and file system it started with.
 */
export function allowPnpRuntime() {
  allowed = true;
}

/**
 * The state of the Yarn Plug'n'Play runtime after `ensurePnpRuntime`.
 *
 * - `active`: a runtime was already active, such as under `yarn chromatic`.
 * - `loaded`: this call loaded the project's runtime.
 * - `not-pnp`: there is no `.pnp.cjs` in the directory or above it.
 * - `not-allowed`: there is one, but the entry point didn't allow loading it.
 * - `failed`: loading or setting it up threw. That was reported to Sentry.
 */
export type PnpRuntime =
  | { status: 'active' }
  | { status: 'loaded' }
  | { status: 'not-pnp' }
  | { status: 'not-allowed'; pnpFile: string }
  | { status: 'failed'; pnpFile: string };

/**
 * Loads the project's Yarn Plug'n'Play runtime into this process, as `yarn node` would, so the
 * dependencies in Yarn's zip archives resolve and can be read. A runtime that fails to load or set
 * up is reported and returned as `failed` rather than thrown, so each caller decides what a runtime
 * it can't use means for it.
 *
 * @param fromDirectory The absolute directory to look upward from for a `.pnp.cjs`.
 * @param log The logger.
 *
 * @returns The state of the runtime after the attempt.
 */
export function ensurePnpRuntime(fromDirectory: string, log: Logger): PnpRuntime {
  if (process.versions.pnp) return { status: 'active' };

  const pnpFile = findPnpFile(fromDirectory);
  if (!pnpFile) return { status: 'not-pnp' };
  if (!allowed) return { status: 'not-allowed', pnpFile };

  try {
    createRequire(pnpFile)(pnpFile).setup();
  } catch (error) {
    // The error's code or class tells one kind of failure from another without the path or
    // wording, so a new kind opens its own issue while repeats of a known one group together.
    const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
    const kind = [code, name].find((value) => typeof value === 'string') ?? 'unknown';
    Sentry.captureException(error, { fingerprint: ['turbosnap-v2', 'pnp-runtime', kind] });
    log.debug(`Failed to load the Yarn Plug'n'Play runtime from ${pnpFile}`, error);
    return { status: 'failed', pnpFile };
  }
  log.debug(`Loaded the Yarn Plug'n'Play runtime from ${pnpFile}`);
  return { status: 'loaded' };
}

function findPnpFile(directory: string): string | undefined {
  for (let current = directory; ; current = path.dirname(current)) {
    const pnpFile = path.join(current, '.pnp.cjs');
    if (existsSync(pnpFile)) return pnpFile;
    if (path.dirname(current) === current) return undefined;
  }
}
