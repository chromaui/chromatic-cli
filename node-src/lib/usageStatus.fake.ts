/* eslint-disable unicorn/no-null -- Match the nullable GraphQL response fields. */
import { BuildOptimization, UsageStatus } from '../types';

export const usageStatus: UsageStatus = {
  dataStatus: 'AVAILABLE',
  recordedAt: '2026-10-22T12:00:00.000Z',
  periodStart: '2026-10-20T00:00:00.000Z',
  periodEnd: '2026-11-20T00:00:00.000Z',
  billableSnapshots: 7000,
  includedSnapshots: 10_000,
  remainingSnapshots: 3000,
  usagePercentage: 70,
  elapsedPercentage: 7,
  daysRemaining: 29,
  threshold: 70,
  isOverageAllowed: true,
  projectedSnapshots: null,
  warnings: [
    {
      code: 'USAGE_THRESHOLD_70',
      severity: 'WARNING',
      message: 'You have used 70% of the included snapshots.',
      action: 'Review usage and TurboSnap before running more builds.',
    },
  ],
  links: {
    billing: 'https://www.chromatic.com/billing',
    documentation: 'https://www.chromatic.com/docs/billing/',
  },
};

export const optimization: BuildOptimization = {
  turboSnapStatus: 'BAILED',
  reason: 'Storybook configuration changed.',
  recommendation:
    'Review shared preview imports before starting more builds. Preserve test coverage.',
  documentationUrl: 'https://www.chromatic.com/docs/turbosnap/',
};
