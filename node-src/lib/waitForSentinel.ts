import { Context } from '../types';

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
  await ctx.ports.uploader.waitForSentinel({ name, url }, { signal });
}
