import setup from '../node-src/errorMonitoring';
setup('cli');

import { run } from '../node-src';
import * as Sentry from '@sentry/node';

/**
 * The main entrypoint for the CLI.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  try {
    const { code } = await run({ argv });
    process.exitCode = code;
  } finally {
    await Sentry.flush(1000);
  }
}
