import * as Sentry from '@sentry/node';
import { existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import type { Stats } from '../../../types';
import { Logger } from '../../log';
import { VersionNotFoundError } from './storybookVersion';

let allowed = false;

/**
 * Lets TurboSnap 2.0 load a Yarn Plug'n'Play project's runtime into this process. Only the CLI and
 * GitHub Action entry points call it. `chromatic/node` never does, so a host process such as
 * Storybook running the Visual Tests addon keeps the module resolution and file system it started
 * with.
 */
export function allowPnpRuntime() {
  allowed = true;
}

/**
 * Loads the project's Yarn Plug'n'Play runtime into this process, as `yarn node` would, so the
 * dependencies in Yarn's zip archives resolve and can be read. It only looks for one when the stats
 * list files inside those archives and no runtime is active yet, as under `yarn chromatic`.
 *
 * @param stats The preview stats file.
 * @param input Where to look for the runtime and what to log with.
 * @param input.configDir The absolute Storybook config directory to look upward from.
 * @param input.log The logger.
 *
 * @throws {VersionNotFoundError} When the runtime isn't installed or can't be loaded. A failure to
 * load or set up a runtime found on disk is reported to Sentry first.
 */
export function loadPnpRuntime(stats: Stats, input: { configDir: string; log: Logger }) {
  if (process.versions.pnp || !stats.modules.some((module) => isInZipArchive(module))) return;

  const pnpFile = findPnpFile(input.configDir);
  const runThroughYarn = `so TurboSnap 2.0 can't read the installed dependencies. Run Chromatic through Yarn, such as with yarn chromatic.`;
  if (!pnpFile) {
    throw new VersionNotFoundError(
      `The stats file lists files inside Yarn Plug'n'Play archives, but there is no .pnp.cjs in ${input.configDir} or above it. TurboSnap hashes installed dependencies, so install them with Yarn before running Chromatic, even for a prebuilt Storybook.`
    );
  }
  if (!allowed) {
    throw new VersionNotFoundError(
      `This project uses Yarn Plug'n'Play (${pnpFile}), and its runtime isn't loaded in this process, ${runThroughYarn}`
    );
  }

  try {
    createRequire(pnpFile)(pnpFile).setup();
  } catch (error) {
    // The error's code or class tells one kind of failure from another without the path or
    // wording, so a new kind opens its own issue while repeats of a known one group together.
    const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
    const kind = [code, name].find((value) => typeof value === 'string') ?? 'unknown';
    Sentry.captureException(error, { fingerprint: ['turbosnap-v2', 'pnp-runtime', kind] });
    input.log.debug(`Failed to load the Yarn Plug'n'Play runtime from ${pnpFile}`, error);
    throw new VersionNotFoundError(
      `Failed to load the Yarn Plug'n'Play runtime from ${pnpFile}, ${runThroughYarn}`
    );
  }
  input.log.debug(`Loaded the Yarn Plug'n'Play runtime from ${pnpFile}`);
}

// Webpack, rspack and Vite all name a dependency under Plug'n'Play by its path inside the zip.
function isInZipArchive(module: Stats['modules'][number]) {
  return [module.id, module.name].some(
    (value) => typeof value === 'string' && /\.zip[/\\]/.test(value)
  );
}

function findPnpFile(directory: string): string | undefined {
  for (let current = directory; ; current = path.dirname(current)) {
    const pnpFile = path.join(current, '.pnp.cjs');
    if (existsSync(pnpFile)) return pnpFile;
    if (path.dirname(current) === current) return undefined;
  }
}
