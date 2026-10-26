import { describe, expect, it } from 'vitest';

import getRunOutput from './getRunOutput';

const counts = {
  webUrl: 'https://www.chromatic.com/build?appId=abc&number=42',
  storybookUrl: 'https://abc-branch.chromatic.com/',
  specCount: 1,
  componentCount: 2,
  testCount: 3,
  changeCount: 4,
  errorCount: 5,
  interactionTestFailuresCount: 6,
  actualTestCount: 7,
  actualCaptureCount: 8,
  inheritedCaptureCount: 9,
  pendingCount: 1,
  ignoredCount: 3,
};

describe('getRunOutput', () => {
  it('reports pending and ignored tests next to changeCount for a new build', () => {
    const ctx = { exitCode: 1, build: counts } as any;
    const { webUrl, ...rest } = counts;

    expect(getRunOutput(ctx)).toEqual({ code: 1, url: webUrl, buildUrl: webUrl, ...rest });
  });

  it('reports pending and ignored tests from the rebuilt build when no new build was made', () => {
    const ctx = { exitCode: 0, rebuildForBuild: counts } as any;

    expect(getRunOutput(ctx)).toMatchObject({
      changeCount: 4,
      pendingCount: 1,
      ignoredCount: 3,
    });
  });

  it('prefers the storybookUrl on the context when the build has none', () => {
    const ctx = {
      exitCode: 0,
      build: { ...counts, storybookUrl: '' },
      storybookUrl: 'https://context.chromatic.com/',
    } as any;

    expect(getRunOutput(ctx).storybookUrl).toBe('https://context.chromatic.com/');
  });

  it('leaves the counts undefined when there is no build', () => {
    const output = getRunOutput({ exitCode: 254 } as any);

    expect(output.code).toBe(254);
    expect(output.pendingCount).toBeUndefined();
    expect(output.ignoredCount).toBeUndefined();
  });
});
