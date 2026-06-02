import { describe, expect, it, vi } from 'vitest';

import { AuthDeps, AuthInput, runAuth } from './auth';

const buildDeps = (overrides: Partial<AuthDeps> = {}): AuthDeps => ({
  client: { runQuery: vi.fn(), setAuthorization: vi.fn() } as any,
  env: { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' } as any,
  log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } as any,
  ...overrides,
});

const appInfoResult = (isReactNativeApp: boolean) => ({
  app: { features: { isReactNativeApp } },
});

describe('runAuth', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery
      .mockResolvedValueOnce({ appToken: 'app-token' })
      .mockResolvedValueOnce(appInfoResult(false));
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = { mode: 'app', projectToken: 'test' };
    const result = await runAuth(deps, input);

    expect(client.setAuthorization).toHaveBeenCalledWith('app-token');
    expect(result).toEqual({ kind: 'continue', output: { isReactNativeApp: false } });
  });

  it('supports projectId + userToken (cli mode)', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery
      .mockResolvedValueOnce({ cliToken: 'cli-token' })
      .mockResolvedValueOnce(appInfoResult(false));
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = {
      mode: 'cli',
      projectId: 'Project:abc123',
      userToken: 'user-token',
      projectToken: 'test',
    };
    const result = await runAuth(deps, input);

    expect(client.setAuthorization).toHaveBeenCalledWith('cli-token');
    expect(result).toEqual({ kind: 'continue', output: { isReactNativeApp: false } });
  });

  it('returns isReactNativeApp: true when the pre-flight query says so', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery
      .mockResolvedValueOnce({ appToken: 'app-token' })
      .mockResolvedValueOnce(appInfoResult(true));
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = { mode: 'app', projectToken: 'test' };
    const result = await runAuth(deps, input);

    expect(result).toEqual({ kind: 'continue', output: { isReactNativeApp: true } });
  });

  it('defaults isReactNativeApp to false when the pre-flight query fails', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery
      .mockResolvedValueOnce({ appToken: 'app-token' })
      .mockRejectedValueOnce(new Error('network error'));
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = { mode: 'app', projectToken: 'test' };
    const result = await runAuth(deps, input);

    expect(result).toEqual({ kind: 'continue', output: { isReactNativeApp: false } });
  });

  it('throws invalidProjectId on "Must login" / "No Access"', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockRejectedValue([{ message: 'Must login' }]);
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = {
      mode: 'cli',
      projectId: 'Project:abc',
      userToken: 'tok',
      projectToken: 'test',
    };
    await expect(runAuth(deps, input)).rejects.toThrow(/Project:abc/);
  });

  it('throws invalidProjectToken on "No app with code"', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockRejectedValue([{ message: 'No app with code' }]);
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = { mode: 'app', projectToken: 'bad-token' };
    await expect(runAuth(deps, input)).rejects.toThrow(/bad-token/);
  });
});
