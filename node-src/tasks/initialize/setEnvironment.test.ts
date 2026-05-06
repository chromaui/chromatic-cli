import TestLogger from '@cli/testLogger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setEnvironment } from './setEnvironment';

process.env.GERRIT_BRANCH = 'foo/bar';
process.env.TRAVIS_EVENT_TYPE = 'pull_request';

const environment = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const log = new TestLogger();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setEnvironment', () => {
  it('sets the environment info on context', async () => {
    const ctx = { env: environment, log } as any;
    await setEnvironment(ctx);
    expect(ctx.environment).toMatchObject({
      GERRIT_BRANCH: 'foo/bar',
      TRAVIS_EVENT_TYPE: 'pull_request',
    });
  });
});
