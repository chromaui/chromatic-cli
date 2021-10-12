import outdatedPackage from './outdatedPackage';

export default {
  title: 'CLI/Messages/Warnings',
};

const ctx = { pkg: { version: '3.0.1' } };

export const OutdatedPackage = () => outdatedPackage(ctx, '4.0.0');
export const OutdatedYarnPackage = () => outdatedPackage(ctx, '4.0.0', true);
