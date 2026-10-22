import { BuildOptimization, UsageStatus } from '../types';
import { Logger } from './log';

export const usageStatusSelection = `
  usageStatus {
    dataStatus
    recordedAt
    periodStart
    periodEnd
    billableSnapshots
    includedSnapshots
    remainingSnapshots
    usagePercentage
    elapsedPercentage
    daysRemaining
    threshold
    isOverageAllowed
    projectedSnapshots
    warnings { code severity message action }
    links { billing documentation }
  }
`;

export const optimizationSelection = `
  optimization { turboSnapStatus reason recommendation documentationUrl }
`;

/**
 * Log authoritative advice once per changed summary, without changing build exit status.
 *
 * @param log Logger used by interactive and CI runs.
 * @param status The current account usage summary.
 * @param previous The previously reported data, used to avoid duplicate advice.
 */
export function logUsageStatus(
  log: Logger,
  status: UsageStatus | null | undefined,
  previous?: UsageStatus | null
) {
  if (status === undefined) return;
  const message = formatUsageStatus(status);
  if (message && message !== (previous === undefined ? undefined : formatUsageStatus(previous))) {
    log.warn(message);
  }
}

function formatUsageStatus(status: UsageStatus | null) {
  if (!status || status.dataStatus === 'UNAVAILABLE') {
    return 'Chromatic account usage is unavailable. Check account usage before starting more builds; unavailable usage does not mean there is remaining allowance.';
  }
  if (status.warnings.length === 0) return undefined;

  const period = status.periodEnd ? `Billing period ends ${status.periodEnd}.` : '';
  const time = status.daysRemaining === null ? '' : `${status.daysRemaining} days remaining.`;
  const usage =
    status.usagePercentage === null
      ? ''
      : `${Math.floor(status.usagePercentage)}% of the included snapshot allowance used.`;
  const overages = status.isOverageAllowed
    ? 'Additional usage can incur overages.'
    : 'Builds can be limited when the allowance is exhausted.';

  return [
    `Chromatic usage: ${usage} ${time} ${period}`.trim(),
    ...status.warnings.map(({ code, message, action }) => `[${code}] ${message} ${action}`),
    overages,
    status.links.billing || status.links.documentation,
  ].join('\n');
}

/**
 * Show actionable TurboSnap advice without suggesting reductions in test coverage.
 *
 * @param log Logger used by interactive and CI runs.
 * @param optimization The current server-provided TurboSnap guidance.
 * @param previous The previously reported data, used to avoid duplicate advice.
 */
export function logOptimization(
  log: Logger,
  optimization: BuildOptimization | null | undefined,
  previous?: BuildOptimization | null
) {
  if (!optimization || ['APPLIED', 'UNKNOWN'].includes(optimization.turboSnapStatus)) return;
  if (JSON.stringify(optimization) === JSON.stringify(previous)) return;
  log.warn(
    [
      `TurboSnap: ${optimization.turboSnapStatus}. ${optimization.reason || ''}`.trim(),
      optimization.recommendation,
      optimization.documentationUrl,
    ].join('\n')
  );
}
