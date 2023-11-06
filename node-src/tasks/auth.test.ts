import { describe, expect, it, vi } from 'vitest';

import { setAuthorizationToken } from './auth';

describe('setAuthorizationToken', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockReturnValue({ appToken: 'app-token' });

    await setAuthorizationToken({ client, options: { projectToken: 'test' } } as any);
    expect(client.setAuthorization).toHaveBeenCalledWith('app-token');
  });

  it('supports projectId + userToken', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockReturnValue({ cliToken: 'cli-token' });

    await setAuthorizationToken({
      client,
      env: { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' },
      options: { projectId: 'Project:abc123', userToken: 'user-token' },
    } as any);
    expect(client.setAuthorization).toHaveBeenCalledWith('cli-token');
  });
});
