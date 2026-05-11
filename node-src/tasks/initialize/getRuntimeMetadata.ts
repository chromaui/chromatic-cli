import { getPackageManagerName, getPackageManagerVersion } from '@cli/getPackageManager';
import * as Sentry from '@sentry/node';

import { Deps, RuntimeMetadata } from '../../types';

type GetRuntimeMetadataDeps = Pick<Deps, 'log'>;

export const getRuntimeMetadata = async (
  deps: GetRuntimeMetadataDeps
): Promise<RuntimeMetadata> => {
  const runtimeMetadata: RuntimeMetadata = {
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
  };

  try {
    const packageManager = await getPackageManagerName();
    if (!packageManager) {
      throw new Error('Failed to determine package manager');
    }

    runtimeMetadata.packageManager = packageManager as RuntimeMetadata['packageManager'];
    Sentry.setTag('packageManager', packageManager);

    const packageManagerVersion = await getPackageManagerVersion(packageManager);
    runtimeMetadata.packageManagerVersion = packageManagerVersion;
    Sentry.setTag('packageManagerVersion', packageManagerVersion);
  } catch (err) {
    deps.log.debug(`Failed to fully determine runtime metadata: ${err.message}`);
  }
  return runtimeMetadata;
};
