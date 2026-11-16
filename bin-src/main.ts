import '../node-src/errorMonitoring';

import * as Sentry from '@sentry/node';

import { run } from '../node-src';
import { allowProjectPnpRuntime } from '../node-src/lib/pnpRuntime';
import { exitCodes } from '../node-src/lib/setExitCode';

/**
 * The main entrypoint for the CLI.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  allowProjectPnpRuntime();
  try {
    const { code } = await run({ argv });
    process.exitCode = code;
  } catch (err) {
    Sentry.captureException(err);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = exitCodes.UNKNOWN_ERROR;
  } finally {
    await Sentry.flush(2500);
    process.exit();
  }
}
