import { getPackageManagerName, getPackageManagerVersion } from '@cli/getPackageManager';
import * as Sentry from '@sentry/node';

import { Context } from '../../types';

export const setRuntimeMetadata = async (ctx: Context) => {
  ctx.runtimeMetadata = {
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
  };

  try {
    const packageManager = await getPackageManagerName();
    if (!packageManager) {
      throw new Error('Failed to determine package manager');
    }

    ctx.runtimeMetadata.packageManager = packageManager as any;
    Sentry.setTag('packageManager', packageManager);

    const packageManagerVersion = await getPackageManagerVersion(packageManager);
    ctx.runtimeMetadata.packageManagerVersion = packageManagerVersion;
    Sentry.setTag('packageManagerVersion', packageManagerVersion);
  } catch (err) {
    ctx.log.debug(`Failed to set runtime metadata: ${err.message}`);
  }
};
