import snapshotQuotaReached from './snapshotQuotaReached';

export default {
  title: 'CLI/Messages/Warnings',
};

export const SnapshotQuotaReached = () =>
  snapshotQuotaReached({
    billingUrl: 'https://www.chromatic.com/billing',
  });
