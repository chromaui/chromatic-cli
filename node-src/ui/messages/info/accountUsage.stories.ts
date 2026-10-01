import accountUsage from './accountUsage';

export default {
  title: 'CLI/Messages/Info',
  component: accountUsage,
};

const period = { periodStart: 1_789_167_000_000, periodEnd: 1_791_759_000_000 };

export const AccountUsageWithinLimit = {
  args: { billableSnapshots: 42_317.4, limit: 85_000, utilization: 42_317.4 / 85_000, ...period },
};

export const AccountUsageOverLimit = {
  args: {
    billableSnapshots: 1_036_922.6,
    limit: 85_000,
    utilization: 1_036_922.6 / 85_000,
    ...period,
  },
};

export const AccountUsageWithoutLimit = {
  args: { billableSnapshots: 1_036_922.6, ...period },
};
