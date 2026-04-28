import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/report';
import { generateReport } from './report';

vi.mock('../run/phases/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/report')>();
  return { ...actual, runReportPhase: vi.fn() };
});

const runReportPhase = vi.mocked(phaseModule.runReportPhase);

afterEach(() => {
  vi.clearAllMocks();
});

describe('generateReport', () => {
  it('mirrors reportPath onto context', async () => {
    runReportPhase.mockResolvedValueOnce({ reportPath: '/abs/report.xml' });
    const ctx = {
      options: { junitReport: true },
      build: { number: 1, reportToken: 'rt' },
      log: { debug: vi.fn() },
      ports: {},
    } as any;
    await generateReport(ctx);
    expect(ctx.reportPath).toBe('/abs/report.xml');
  });

  it('does not set reportPath when phase returns none', async () => {
    runReportPhase.mockResolvedValueOnce({});
    const ctx = {
      options: {},
      build: { number: 1, reportToken: 'rt' },
      log: { debug: vi.fn() },
      ports: {},
    } as any;
    await generateReport(ctx);
    expect(ctx.reportPath).toBeUndefined();
  });
});
