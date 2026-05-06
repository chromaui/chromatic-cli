import TestLogger from '@cli/testLogger';
import { describe, expect, it } from 'vitest';

import { setEnvironment } from './setEnvironment';

process.env.GERRIT_BRANCH = 'foo/bar';
process.env.TRAVIS_EVENT_TYPE = 'pull_request';
process.env.SHOULD_BE_FILTERED_OUT = 'foo';

const environment = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const log = new TestLogger();

describe('setEnvironment', () => {
  it('returns the environment info', async () => {
    const deps = { env: environment, log } as any;
    const result = setEnvironment(deps);
    expect(result).toMatchObject({
      GERRIT_BRANCH: 'foo/bar',
      TRAVIS_EVENT_TYPE: 'pull_request',
    });
  });

  it('filters out environment variables that are not in the whitelist', async () => {
    const deps = { env: environment, log } as any;
    const result = setEnvironment(deps);
    expect(result).not.toHaveProperty('SHOULD_BE_FILTERED_OUT');
  });
});
