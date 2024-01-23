import retry from 'async-retry';
import { Response } from 'node-fetch';
import { Context } from '../types';

// A sentinel file is created by a zip-unpack lambda within the Chromatic infrastructure once the
// uploaded zip is fully extracted. The contents of this file will consist of 'OK' if the process
// completed successfully and 'ERROR' if an error occurred.
const SENTINEL_SUCCESS_VALUE = 'OK';

export async function waitForSentinel(ctx: Context, { name, url }: { name: string; url: string }) {
  const { experimental_abortSignal: signal } = ctx.options;

  ctx.log.debug(`Waiting for '${name}' sentinel file to appear at ${url}`);

  return retry(
    async (bail) => {
      if (signal?.aborted) {
        return bail(signal.reason || new Error('Aborted'));
      }

      let res: Response;
      try {
        res = await ctx.http.fetch(url, { signal }, { retries: 0, noLogErrorBody: true });
      } catch (e) {
        const { response = {} } = e;
        if (response.status === 403) {
          return bail(new Error('Provided signature expired.'));
        }
        throw new Error(`Sentinel file '${name}' not present.`);
      }

      const result = await res.text();
      if (result !== SENTINEL_SUCCESS_VALUE) {
        ctx.log.debug(`Sentinel file '${name}' not OK, got '${result}'.`);
        return bail(new Error(`Sentinel file '${name}' not OK.`));
      }
      ctx.log.debug(`Sentinel file '${name}' OK.`);
    },
    {
      retries: 185, // 3 minutes and some change (matches the lambda timeout with some extra buffer)
      minTimeout: 1000,
      maxTimeout: 1000,
    }
  );
}
