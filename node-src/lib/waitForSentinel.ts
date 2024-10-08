import retry from 'async-retry';

import { Context } from '../types';

// A sentinel file is created by a zip-unpack lambda within the Chromatic infrastructure once the
// uploaded zip is fully extracted. The contents of this file will consist of 'OK' if the process
// completed successfully and 'ERROR' if an error occurred.
const SENTINEL_SUCCESS_VALUE = 'OK';

/**
 * Wait for a sentinel file to appear within the provided URL by checking for its existence on a
 * loop.
 *
 * @param ctx The context set when executing the CLI.
 * @param file The file information for locating the file.
 * @param file.name The name of the sentinel file in question.
 * @param file.url The url of the sentinel file in question.
 *
 * @returns A promise that resolves when the sentinel file is found.
 */
export async function waitForSentinel(ctx: Context, { name, url }: { name: string; url: string }) {
  const { experimental_abortSignal: signal } = ctx.options;

  ctx.log.debug(`Waiting for '${name}' sentinel file to appear at ${url}`);

  return retry(
    async (bail) => {
      if (signal?.aborted) {
        return bail(signal.reason || new Error('Aborted'));
      }

      try {
        const response = await ctx.http.fetch(
          url,
          { signal },
          { retries: 0, noLogErrorBody: true }
        );
        const result = await response.text();
        if (result !== SENTINEL_SUCCESS_VALUE) {
          ctx.log.debug(`Sentinel file '${name}' not OK, got '${result}'.`);
          return bail(new Error(`Sentinel file '${name}' not OK.`));
        }
        ctx.log.debug(`Sentinel file '${name}' OK.`);
      } catch (err) {
        const { message, response = {} } = err;
        if (response.status === 403) {
          return bail(new Error('Provided signature expired.'));
        }
        if (response.status === 404) {
          throw new Error(`Sentinel file '${name}' not present.`);
        }
        if (ctx.log.getLevel() === 'debug') {
          ctx.log.debug(await response.text());
        }
        return bail(new Error(message));
      }
    },
    {
      retries: 185, // 3 minutes and some change (matches the lambda timeout with some extra buffer)
      minTimeout: 1000,
      maxTimeout: 1000,
    }
  );
}
