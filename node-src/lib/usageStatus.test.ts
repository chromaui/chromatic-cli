import { describe, expect, it } from 'vitest';

import TestLogger from './testLogger';
import { logOptimization, logUsageStatus } from './usageStatus';
import { optimization, usageStatus } from './usageStatus.fake';

describe('usage advice', () => {
  it.each([50, 70, 90, 100, 125])(
    'shows %s percent with the remaining billing time and an action',
    (percentage) => {
      const log = new TestLogger();
      logUsageStatus(log, { ...usageStatus, usagePercentage: percentage });
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(`${percentage}%`));
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('29 days remaining'));
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(String(usageStatus.periodEnd)));
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining(usageStatus.warnings[0].action)
      );
    }
  );

  it('does not round usage up across a warning threshold', () => {
    const log = new TestLogger();
    logUsageStatus(log, { ...usageStatus, usagePercentage: 89.6 });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('89%'));
  });

  it('shows pace warnings below the first percentage threshold', () => {
    const log = new TestLogger();
    logUsageStatus(log, { ...usageStatus, usagePercentage: 30, threshold: 0 });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('30%'));
  });

  it('does not repeat unchanged advice when only the calculation timestamp changes', () => {
    const log = new TestLogger();
    logUsageStatus(log, { ...usageStatus, recordedAt: '2026-10-22T12:01:00.000Z' }, usageStatus);
    expect(log.warn).not.toHaveBeenCalled();
    logUsageStatus(log, { ...usageStatus, usagePercentage: 95, threshold: 90 }, usageStatus);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('95%'));
  });

  it('does not interpret unavailable or unauthorized data as zero', () => {
    const log = new TestLogger();
    logUsageStatus(log, { ...usageStatus, dataStatus: 'UNAVAILABLE', usagePercentage: null });
    logUsageStatus(log, null);
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('usage is unavailable'));
    expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('0%'));
  });

  it('leaves an old-server response and a healthy account quiet', () => {
    const log = new TestLogger();
    logUsageStatus(log, undefined);
    logUsageStatus(log, { ...usageStatus, warnings: [] });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('distinguishes overages and limited builds without changing exit behavior', () => {
    const log = new TestLogger();
    logUsageStatus(log, { ...usageStatus, isOverageAllowed: false });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Builds can be limited'));
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs specific TurboSnap recommendations once and stays quiet when applied', () => {
    const log = new TestLogger();
    logOptimization(log, optimization);
    logOptimization(log, optimization, optimization);
    logOptimization(log, { ...optimization, turboSnapStatus: 'APPLIED' });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(optimization.recommendation));
  });
});
