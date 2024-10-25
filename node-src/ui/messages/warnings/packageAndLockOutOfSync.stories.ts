import packageAndLockOutOfSync from './packageAndLockOutOfSync';

export default {
  title: 'CLI/Messages/Warnings',
};

export const PackageAndLockOutOfSyncWithDep = () => packageAndLockOutOfSync('@types/express');
export const PackageAndLockOutOfSyncWithoutDep = () => packageAndLockOutOfSync();
