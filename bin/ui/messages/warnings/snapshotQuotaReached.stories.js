import snapshotQuotaReached from './snapshotQuotaReached';

export default {
  title: 'CLI/Messages/Warnings',
};

export const SnapshotQuotaReached = () =>
  snapshotQuotaReached({
    billingUrl: 'https://www.chromatic.com/billing?accountId=5af25af03c9f2c4bdccc0fcb',
  });
