import { describe, expect, it } from 'vitest';

import { Context } from '../types';
import getTasks from './index';

const makeContext = (options: Partial<Context['options']> = {}) => ({ options }) as Context;

describe('getTasks', () => {
  it('returns no tasks when junitReport is not set', () => {
    const ctx = makeContext({});

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(0);
  });

  it('appends the report task when junitReport is set', () => {
    const ctx = makeContext({ junitReport: 'chromatic-build-{buildNumber}.xml' });

    const tasks = getTasks(ctx);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe('Generate build report');
  });
});
