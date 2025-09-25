import * as Sentry from '@sentry/node';
import semver from 'semver';
import { hasYarn } from 'yarn-or-npm';

import { Context } from '..';
import outdatedPackage from '../ui/messages/warnings/outdatedPackage';
import spawn from './spawn';

const rejectIn = (ms: number) => new Promise<any>((_, reject) => setTimeout(reject, ms));
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, rejectIn(ms)]);

/**
 * Check for a newer version of the CLI.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A promise that resolves when we're done checking for new CLI versions.
 */
export default async function checkForUpdates(ctx: Context) {
  if (ctx.options.skipUpdateCheck === true) {
    ctx.log.info(`Skipping update check`);
    return;
  }

  if (!semver.valid(ctx.pkg.version)) {
    ctx.log.warn(`Invalid semver version in package.json: ${ctx.pkg.version}`);
    return;
  }

  let latestVersion: string;
  try {
    const registryUrl = await spawn(['config', 'get', 'registry']).catch(
      () => 'https://registry.npmjs.org/'
    );
    if (!['https://registry.npmjs.org/', 'https://registry.yarnpkg.com'].includes(registryUrl)) {
      ctx.log.info(`Using custom npm registry: ${registryUrl}`);
    }

    const pkgUrl = new URL(ctx.pkg.name, registryUrl).href;
    const result = await withTimeout(ctx.http.fetch(pkgUrl), 5000); // If not fetched within 5 seconds, nevermind.
    const { 'dist-tags': distributionTags = {} } = (await result.json()) as any;
    if (!semver.valid(distributionTags.latest)) {
      ctx.log.warn(`Invalid dist-tag 'latest' returned from registry; skipping update check`);
      return;
    }
    latestVersion = distributionTags.latest;
  } catch (err) {
    const isInvalidUrlError = err instanceof TypeError && err.message.includes('Invalid URL');
    if (!isInvalidUrlError) {
      Sentry.captureException(err);
    }
    ctx.log.warn(`Could not retrieve package info from registry; skipping update check`);
    ctx.log.warn(err);
    return;
  }

  if (semver.major(ctx.pkg.version) < semver.major(latestVersion)) {
    ctx.log.warn(outdatedPackage(ctx, latestVersion, hasYarn()));
  }
}
