import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryChromaticApi } from '../../lib/ports/chromaticApiInMemoryAdapter';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runAuthPhase } from './auth';

afterEach(() => {
  vi.clearAllMocks();
});

describe('runAuthPhase', () => {
  it('resolves an app token from a projectToken and installs it on the port', async () => {
    const state = { appToken: 'app-token' } as any;
    const chromatic = createInMemoryChromaticApi(state);
    const result = await runAuthPhase({
      options: { projectToken: 'tok' } as unknown as Options,
      log: new TestLogger(),
      ports: { chromatic },
    });
    expect(result.token).toBe('app-token');
    expect(state.authorizationToken).toBe('app-token');
  });

  it('resolves a CLI token from projectId + userToken', async () => {
    const state = { cliToken: 'cli-token' } as any;
    const chromatic = createInMemoryChromaticApi(state);
    const result = await runAuthPhase({
      options: { projectId: 'p', userToken: 'u' } as unknown as Options,
      log: new TestLogger(),
      ports: { chromatic },
    });
    expect(result.token).toBe('cli-token');
    expect(state.authorizationToken).toBe('cli-token');
  });

  it('translates "Must login" errors into invalidProjectId', async () => {
    const chromatic = createInMemoryChromaticApi({});
    chromatic.createAppToken = vi.fn(async () => {
      throw [{ message: 'Must login' }];
    });
    await expect(
      runAuthPhase({
        options: { projectToken: 'tok', projectId: 'Project:abc' } as unknown as Options,
        log: new TestLogger(),
        ports: { chromatic },
      })
    ).rejects.toThrow(/Project:abc/);
  });

  it('translates "No app with code" errors into invalidProjectToken', async () => {
    const chromatic = createInMemoryChromaticApi({});
    chromatic.createAppToken = vi.fn(async () => {
      throw [{ message: 'No app with code "tok"' }];
    });
    await expect(
      runAuthPhase({
        options: { projectToken: 'tok' } as unknown as Options,
        log: new TestLogger(),
        ports: { chromatic },
      })
    ).rejects.toThrow(/Invalid --project-token/);
  });

  it('throws when neither projectToken nor projectId+userToken is provided', async () => {
    const chromatic = createInMemoryChromaticApi({});
    await expect(
      runAuthPhase({
        options: {} as unknown as Options,
        log: new TestLogger(),
        ports: { chromatic },
      })
    ).rejects.toThrow(/No projectId or projectToken/);
  });
});
