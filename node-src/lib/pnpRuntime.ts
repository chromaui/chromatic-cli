import { createRequire } from 'module';

import { Logger } from './log';
import { ProjectSetup } from './projectSetup';
import { captureTurboSnapFailure } from './turbosnap/v2/captureFailure';

let allowed = false;

/**
 * Lets this process load a Yarn Plug'n'Play project's runtime. Only the CLI and GitHub Action entry
 * points call it. `chromatic/node` never does, so a host process such as Storybook running the Visual
 * Tests addon keeps the module resolution and file system it started with.
 */
export function allowProjectPnpRuntime() {
  allowed = true;
}

/**
 * Loads the project's Plug'n'Play runtime into this process, as `yarn node` would, so packages
 * resolve and files inside Yarn's zip archives can be read. Does nothing unless the entry point
 * allowed it, the project uses Plug'n'Play, and no runtime is active yet, such as under
 * `yarn chromatic` or `yarn dlx chromatic`, whose runtime already finds the project's.
 *
 * A failure is reported to Sentry here, once, and never thrown: TurboSnap 2.0 then refuses the
 * setup with a message, and TurboSnap 1.0 decides the build.
 *
 * @param setup The detected project setup.
 * @param log The logger to record the outcome with.
 *
 * @returns The setup, with the runtime's status after the attempt.
 */
export function activateProjectPnpRuntime(setup: ProjectSetup, log: Logger): ProjectSetup {
  if (!allowed || setup.layout !== 'pnp' || setup.pnpRuntime === 'active') return setup;

  let runtime: { setup: () => void };
  try {
    runtime = createRequire(setup.pnpFile)(setup.pnpFile);
  } catch (error) {
    return failed(setup, 'load', error, log);
  }
  try {
    runtime.setup();
  } catch (error) {
    // `setup` marks the runtime active before it patches anything, so a throw can leave
    // `process.versions.pnp` set over a half-applied runtime; the status here is the one to trust.
    return failed(setup, 'setup', error, log);
  }
  log.debug(`Loaded the Yarn Plug'n'Play runtime from ${setup.pnpFile}`);
  return { ...setup, pnpRuntime: 'active' };
}

function failed(
  setup: Extract<ProjectSetup, { layout: 'pnp' }>,
  phase: 'load' | 'setup',
  error: unknown,
  log: Logger
): ProjectSetup {
  log.debug(`Failed to ${phase} the Yarn Plug'n'Play runtime from ${setup.pnpFile}`, error);
  // The error's code or class tells one kind of failure from another without the path or wording,
  // so a new kind opens its own issue while repeats of a known one group together.
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  const kind = [code, name].find((value) => typeof value === 'string') ?? 'unknown';
  captureTurboSnapFailure(error, ['pnp-runtime', phase, String(kind)], {
    pnp_runtime: { phase, pnpFile: setup.pnpFile, nodeVersion: process.versions.node },
  });
  return { ...setup, pnpRuntime: 'failed' };
}
