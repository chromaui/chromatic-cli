import { describe, expect, it, vi } from 'vitest';

import { AuthDeps, AuthInput, runAuth } from './auth';

const buildDeps = (overrides: Partial<AuthDeps> = {}): AuthDeps => ({
  client: { runQuery: vi.fn(), setAuthorization: vi.fn() } as any,
  env: { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' } as any,
  ...overrides,
});

describe('runAuth', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockResolvedValue({ appToken: 'app-token' });
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = { mode: 'app', projectToken: 'test' };
    const result = await runAuth(deps, input);

    expect(client.setAuthorization).toHaveBeenCalledWith('app-token');
    expect(result).toEqual({ kind: 'continue', output: undefined });
  });

  it('supports projectId + userToken (cli mode)', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockResolvedValue({ cliToken: 'cli-token' });
    const deps = buildDeps({ client: client as any });

    const input: AuthInput = {
      mode: 'cli',
      projectId: 'Project:abc123',
      userToken: 'user-token',
      projectToken: 'test',
    };
    const result = await runAuth(deps, input);

    expect(client.setAuthorization).toHaveBeenCalledWith('cli-token');
    expect(result).toEqual({ kind: 'continue', output: undefined });
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
