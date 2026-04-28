import '../node-src/errorMonitoring';

import * as Sentry from '@sentry/node';

import { ChromaticRun } from '../node-src/run/chromaticRun';

/**
 * The main entrypoint for the CLI.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  try {
    const result = await new ChromaticRun({ config: { argv } }).execute();
    process.exitCode = result.exitCode;
  } catch (err) {
    Sentry.captureException(err);
  } finally {
    await Sentry.flush(2500);
    process.exit();
  }
}
