import * as Sentry from '@sentry/node';
import semver from 'semver';
import { hasYarn } from 'yarn-or-npm';

import { Context } from '..';
import outdatedPackage from '../ui/messages/warnings/outdatedPackage';
import spawn from './spawn';
import { withTimeout } from './utilities';

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
    const { latest } = await fetchReleases(ctx);
    if (!latest || !semver.valid(latest)) {
      ctx.log.warn(`Invalid dist-tag 'latest' returned from registry; skipping update check`);
      return;
    }
    latestVersion = latest;
  } catch (err) {
    if (shouldReportVersionCheckFailure(err)) {
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

/**
 * Looks up the package's releases on the npm registry the package manager is set up with.
 *
 * @param ctx The context's HTTP client, logger, and package name.
 *
 * @returns The `latest` dist-tag as the registry returned it, which may not be a valid version,
 * and when each version was published, as ISO dates by version, if the registry says.
 */
export async function fetchReleases(ctx: Pick<Context, 'http' | 'log' | 'pkg'>) {
  const registryUrl = await spawn(['config', 'get', 'registry'])
    // Yarn 2 and later call it npmRegistryServer.
    .catch(() => spawn(['config', 'get', 'npmRegistryServer']))
    .catch(() => 'https://registry.npmjs.org/');
  if (!['https://registry.npmjs.org/', 'https://registry.yarnpkg.com'].includes(registryUrl)) {
    ctx.log.info(`Using custom npm registry: ${registryUrl}`);
  }

  // Yarn's npmRegistryServer has no trailing slash, which would drop the last part of its path.
  const pkgUrl = new URL(ctx.pkg.name, registryUrl.replace(/\/?$/, '/')).href;
  const controller = new AbortController();
  const lookup = async () => {
    const result = await ctx.http.fetch(pkgUrl, { signal: controller.signal });
    const { 'dist-tags': distributionTags = {}, time = {} } = (await result.json()) as any;
    return {
      latest: distributionTags.latest as string | undefined,
      published: time as Record<string, string>,
    };
  };
  try {
    // If not fetched and read within 5 seconds, nevermind.
    return await withTimeout(lookup(), 5000);
  } catch (err) {
    // A request still waiting on an unresponsive registry would otherwise keep the process alive
    // until the OS gives up on it, minutes after the command finished.
    controller.abort();
    throw err;
  }
}

/**
 * Determine if we should report an error thrown during Chromatic version checking with
 * an NPM registry to Sentry. We want to avoid reporting errors that are likely configuration
 * or network connectivity.
 *
 * @param err The error thrown during version checking.
 *
 * @returns True if we should report the error, false otherwise.
 */
function shouldReportVersionCheckFailure(err: unknown) {
  if (!(err instanceof Error)) {
    return false;
  }

  // npm registry was set to an invalid URL
  const isInvalidUrlError = err instanceof TypeError && err.message.includes('Invalid URL');

  // http failure reaching the npm registry (usually auth for custom registries)
  const isFetchError = err.message.includes('HTTPClient failed to fetch');

  return !(isInvalidUrlError || isFetchError);
}
