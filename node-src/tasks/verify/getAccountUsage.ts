import { AccountUsage, Deps } from '../../types';

const AccountUsageQuery = `
  query AccountUsageQuery {
    app {
      account {
        currentUsage {
          totalFinalBillableCount
          from
          to
        }
        subscription {
          monthlyUsageLimit
          bonusUsage
        }
      }
    }
  }
`;

interface AccountUsageQueryResult {
  app: {
    account?: {
      currentUsage?: {
        totalFinalBillableCount: number;
        from: number;
        to: number;
      } | null;
      subscription?: {
        monthlyUsageLimit?: number | null;
        bonusUsage?: number | null;
      } | null;
    } | null;
  };
}

/**
 * Fetch the account's billed snapshot usage for the current billing period.
 *
 * This is informational only, so any failure (including the API not exposing these fields to the
 * project token) is logged at debug level and never affects the build.
 *
 * @param deps Dependencies (client, log).
 *
 * @returns The account's usage, or undefined if it is unavailable.
 */
export async function getAccountUsage(
  deps: Pick<Deps, 'client' | 'log'>
): Promise<AccountUsage | undefined> {
  try {
    const { app } = await deps.client.runQuery<AccountUsageQueryResult>(
      AccountUsageQuery,
      {},
      { retries: 0 }
    );
    const usage = app.account?.currentUsage;
    if (!usage) {
      return undefined;
    }

    const { monthlyUsageLimit, bonusUsage } = app.account?.subscription ?? {};
    const limit = monthlyUsageLimit ? monthlyUsageLimit + (bonusUsage ?? 0) : undefined;
    return {
      billableSnapshots: usage.totalFinalBillableCount,
      limit,
      utilization: limit ? usage.totalFinalBillableCount / limit : undefined,
      periodStart: usage.from,
      periodEnd: usage.to,
    };
  } catch (err) {
    deps.log.debug(`Could not fetch account usage: ${err.message}`);
    return undefined;
  }
}
