import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { getAccountUsage } from './getAccountUsage';

const currentUsage = {
  totalFinalBillableCount: 42_500,
  from: 1_789_167_000_000,
  to: 1_791_759_000_000,
};

const deps = (result: unknown) =>
  ({
    client: {
      runQuery: vi.fn(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      ),
    },
    log: new TestLogger(),
  }) as any;

describe('getAccountUsage', () => {
  it('returns usage against the monthly limit plus bonus usage', async () => {
    const usage = await getAccountUsage(
      deps({
        app: {
          account: { currentUsage, subscription: { monthlyUsageLimit: 80_000, bonusUsage: 5000 } },
        },
      })
    );
    expect(usage).toEqual({
      billableSnapshots: 42_500,
      limit: 85_000,
      utilization: 0.5,
      periodStart: currentUsage.from,
      periodEnd: currentUsage.to,
    });
  });

  it('omits the limit and utilization when the plan has no limit', async () => {
    const usage = await getAccountUsage(
      deps({ app: { account: { currentUsage, subscription: { monthlyUsageLimit: null } } } })
    );
    expect(usage).toMatchObject({
      billableSnapshots: 42_500,
      limit: undefined,
      utilization: undefined,
    });
  });

  it('returns undefined when the account has no current usage', async () => {
    expect(await getAccountUsage(deps({ app: { account: null } }))).toBeUndefined();
  });

  it('returns undefined instead of throwing when the query fails', async () => {
    const d = deps(new Error('Not authorized'));
    expect(await getAccountUsage(d)).toBeUndefined();
    expect(d.log.debug).toHaveBeenCalledWith(expect.stringContaining('Not authorized'));
  });
});
