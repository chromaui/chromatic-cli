import reportBuilder from 'junit-report-builder';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateReport } from './report';

const log = { error: vi.fn(), info: vi.fn() };
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
  {
    status: 'DENIED',
    result: '',
    spec: { name: '', component: { name: '' } },
    parameters: { viewportIsDefault: false, viewport: 1080 },
    mode: { name: 'Beast Mode' },
  },
  {
    status: 'BROKEN',
    result: '',
    spec: { name: '', component: { name: '' } },
    parameters: { viewportIsDefault: true, viewport: 1080 },
    mode: { name: null },
  },
  {
    status: 'FAILED',
    result: '',
    spec: { name: '', component: { name: '' } },
    parameters: { viewportIsDefault: false, viewport: 1080 },
    mode: { name: null },
  },
];

vi.spyOn(reportBuilder, 'writeTo').mockImplementation(vi.fn());

describe('generateRport', () => {
  const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
  const build = {
    app: { repository: { provider: 'github' } },
    number: 1,
    reportToken: 'report-token',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    client.runQuery.mockReturnValue({
      app: {
        build: {
          number: 1,
          status: 'PASSED',
          createdAt: 0,
          completedAt: 0,
          webUrl: 'https://google.com',
          storybookUrl: 'https://storybook.js.org',
          tests: mockTests,
        },
      },
    });
  });
  it('sucessfully generates report when passed a string', async () => {
    const ctx = {
      client,
      log,
      options: {
        junitReport: 'tests-file.xml',
      },
      build,
    } as any;
    await generateReport(ctx);
    expect(reportBuilder.writeTo).toHaveBeenCalledWith(
      path.join(__dirname, '../../tests-file.xml')
    );
  });

  it('sucessfully generates report when passed a boolean equal to true', async () => {
    const ctx = {
      client,
      log,
      options: {
        junitReport: true,
      },
      build,
    } as any;
    await generateReport(ctx);
    expect(reportBuilder.writeTo).toHaveBeenCalledWith(
      path.join(__dirname, '../../chromatic-build-1.xml')
    );
  });
});
