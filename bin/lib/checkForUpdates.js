import semver from 'semver';
import { hasYarn } from 'yarn-or-npm';

import outdatedPackage from '../ui/messages/warnings/outdatedPackage';

const rejectIn = (ms) => new Promise((_, reject) => setTimeout(reject, ms));
const withTimeout = (promise, ms) => Promise.race([promise, rejectIn(ms)]);

export default async function checkForUpdates(ctx) {
  if (!semver.valid(ctx.pkg.version)) {
    ctx.log.warn(`Invalid semver version in package.json: ${ctx.pkg.version}`);
    return;
  }

  let latestVersion;
  try {
    const pkgUrl = `https://registry.npmjs.org/${ctx.pkg.name}`;
    // If not fetched within 5 seconds, nevermind.
    const res = await withTimeout(ctx.http.fetch(pkgUrl), 5000);
    const { 'dist-tags': distTags = {} } = await res.json();
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
