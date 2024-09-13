import '../node-src/errorMonitoring';

import * as Sentry from '@sentry/node';

import { run } from '../node-src';

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
    await Sentry.close(1000);
  }
}
