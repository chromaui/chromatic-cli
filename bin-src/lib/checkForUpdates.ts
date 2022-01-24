import semver from 'semver';
import yon from 'yarn-or-npm';
import { Context } from '../types';

import outdatedPackage from '../ui/messages/warnings/outdatedPackage';

const { hasYarn } = yon;

const rejectIn = (ms: number) => new Promise<any>((_, reject) => setTimeout(reject, ms));
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, rejectIn(ms)]);

export default async function checkForUpdates(ctx: Context) {
  if (!semver.valid(ctx.pkg.version)) {
    ctx.log.warn(`Invalid semver version in package.json: ${ctx.pkg.version}`);
    return;
  }

  let latestVersion: string;
  try {
    const pkgUrl = `https://registry.npmjs.org/${ctx.pkg.name}`;
    // If not fetched within 5 seconds, nevermind.
    const res = await withTimeout(ctx.http.fetch(pkgUrl), 5000);
    const { 'dist-tags': distTags = {} } = (await res.json()) as any;
    if (!semver.valid(distTags.latest)) {
      ctx.log.warn(`Invalid dist-tag 'latest' returned from registry; skipping update check`);
      return;
    }
    latestVersion = distTags.latest;
  } catch (e) {
    ctx.log.warn(`Could not retrieve package info from registry; skipping update check`);
    ctx.log.debug(e);
    return;
  }

  if (semver.major(ctx.pkg.version) < semver.major(latestVersion)) {
    ctx.log.warn(outdatedPackage(ctx, latestVersion, hasYarn));
  }
}
