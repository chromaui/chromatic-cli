import reportBuilder from 'junit-report-builder';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runReportPhase } from './report';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mockTests = [
  {
    status: 'ACCEPTED',
    result: '',
    spec: { name: '', component: { name: '' } },
    parameters: { viewportIsDefault: true, viewport: 1080 },
    mode: { name: 'Beast Mode' },
  },
  {
    status: 'PENDING',
    result: '',
    spec: { name: '', component: { name: '' } },
    parameters: { viewportIsDefault: true, viewport: 1080 },
    mode: { name: 'Beast Mode' },
  },
];

vi.spyOn(reportBuilder, 'writeTo').mockImplementation(vi.fn());

afterEach(() => {
  vi.clearAllMocks();
});

describe('runReportPhase', () => {
  const ports = {
    chromatic: { getReport: vi.fn() },
    clock: { now: () => 0, since: () => 0, sleep: async () => undefined },
  } as any;

  beforeEach(() => {
    ports.chromatic.getReport.mockResolvedValue({
      number: 1,
      status: 'PASSED',
      createdAt: 0,
      completedAt: 0,
      webUrl: 'https://google.com',
      storybookUrl: 'https://storybook.js.org',
      tests: mockTests,
    });
  });

  it('writes a report to the explicit path when junitReport is a string', async () => {
    const result = await runReportPhase({
      options: { junitReport: 'tests-file.xml' } as unknown as Options,
      build: { number: 1, reportToken: 'report-token' } as any,
      log: new TestLogger(),
      ports,
    });
    expect(result.reportPath).toBe(path.join(__dirname, '../../../tests-file.xml'));
    expect(reportBuilder.writeTo).toHaveBeenCalledWith(result.reportPath);
  });

  it('uses the default filename pattern when junitReport is true', async () => {
    const result = await runReportPhase({
      options: { junitReport: true } as unknown as Options,
      build: { number: 7, reportToken: 'rt' } as any,
      log: new TestLogger(),
      ports,
    });
    expect(result.reportPath).toMatch(/chromatic-build-7\.xml$/);
    expect(reportBuilder.writeTo).toHaveBeenCalled();
  });

  it('returns no reportPath when junitReport is not configured', async () => {
    const result = await runReportPhase({
      options: {} as Options,
      build: { number: 1, reportToken: 'rt' } as any,
      log: new TestLogger(),
      ports,
    });
    expect(result.reportPath).toBeUndefined();
    expect(reportBuilder.writeTo).not.toHaveBeenCalled();
  });

  it('paginates getReport until all tests are collected', async () => {
    const firstPage = Array.from({ length: 1000 }, () => mockTests[0]);
    ports.chromatic.getReport
      .mockResolvedValueOnce({
        number: 1,
        status: 'PASSED',
        createdAt: 0,
        completedAt: 0,
        webUrl: 'u',
        storybookUrl: 's',
        tests: firstPage,
      })
      .mockResolvedValueOnce({
        number: 1,
        status: 'PASSED',
        createdAt: 0,
        completedAt: 0,
        webUrl: 'u',
        storybookUrl: 's',
        tests: mockTests.slice(0, 1),
      });
    await runReportPhase({
      options: { junitReport: true } as unknown as Options,
      build: { number: 1, reportToken: 'rt' } as any,
      log: new TestLogger(),
      ports,
    });
    expect(ports.chromatic.getReport).toHaveBeenCalledTimes(2);
  });
});
