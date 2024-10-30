import packageAndLockOutOfSync from './packageAndLockFilesOutOfSync';

export default {
  title: 'CLI/Messages/Warnings',
};

export const PackageAndLockOutOfSyncWithDep = () => packageAndLockOutOfSync('@types/express');
export const PackageAndLockOutOfSyncWithoutDep = () => packageAndLockOutOfSync();
