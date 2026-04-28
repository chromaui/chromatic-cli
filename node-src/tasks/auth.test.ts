import { afterEach, describe, expect, it, vi } from 'vitest';

import * as phaseModule from '../run/phases/auth';
import { setAuthorizationToken } from './auth';

vi.mock('../run/phases/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run/phases/auth')>();
  return { ...actual, runAuthPhase: vi.fn() };
});

const runAuthPhase = vi.mocked(phaseModule.runAuthPhase);

afterEach(() => {
  vi.clearAllMocks();
});

describe('setAuthorizationToken', () => {
  it('delegates to runAuthPhase', async () => {
    runAuthPhase.mockResolvedValueOnce({ token: 'a' });
    await setAuthorizationToken({
      options: { projectToken: 'tok' },
      log: { debug: vi.fn() },
      ports: {},
    } as any);
    expect(runAuthPhase).toHaveBeenCalled();
  });
});
