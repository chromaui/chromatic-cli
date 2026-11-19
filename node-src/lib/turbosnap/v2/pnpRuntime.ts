import type { Stats } from '../../../types';
import { ensurePnpRuntime, VersionNotFoundError } from '../../installedPackages';
import { Logger } from '../../log';

/**
 * Loads the project's Yarn Plug'n'Play runtime when the stats list files inside Yarn's zip archives,
 * so TurboSnap 2.0 can resolve and read those dependencies. Projects that don't use Plug'n'Play
 * never look for one.
 *
 * @param stats The preview stats file.
 * @param input Where to look for the runtime and what to log with.
 * @param input.configDir The absolute Storybook config directory to look upward from.
 * @param input.log The logger.
 *
 * @throws {VersionNotFoundError} When the runtime isn't active and can't be loaded.
 */
export function loadPnpRuntime(stats: Stats, input: { configDir: string; log: Logger }) {
  if (!stats.modules.some((module) => isInZipArchive(module))) return;

  const runtime = ensurePnpRuntime(input.configDir, input.log);
  const runThroughYarn = `so TurboSnap 2.0 can't read the installed dependencies. Run Chromatic through Yarn, such as with yarn chromatic.`;
  if (runtime.status === 'active' || runtime.status === 'loaded') return;
  if (runtime.status === 'not-pnp') {
    throw new VersionNotFoundError(
      `The stats file lists files inside Yarn Plug'n'Play archives, but there is no .pnp.cjs in ${input.configDir} or above it. TurboSnap hashes installed dependencies, so install them with Yarn before running Chromatic, even for a prebuilt Storybook.`
    );
  }
  throw new VersionNotFoundError(
    runtime.status === 'failed'
      ? `Failed to load the Yarn Plug'n'Play runtime from ${runtime.pnpFile}, ${runThroughYarn}`
      : `This project uses Yarn Plug'n'Play (${runtime.pnpFile}), and its runtime isn't loaded in this process, ${runThroughYarn}`
  );
}

// Webpack, rspack and Vite all name a dependency under Plug'n'Play by its path inside the zip.
function isInZipArchive(module: Stats['modules'][number]) {
  return [module.id, module.name].some(
    (value) => typeof value === 'string' && /\.zip[/\\]/.test(value)
  );
}
