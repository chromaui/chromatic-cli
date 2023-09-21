import { describe, expect, it, vi } from 'vitest';

import { setAuthorizationToken } from './auth';

describe('setAuthorizationToken', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };
    client.runQuery.mockReturnValue({ createAppToken: 'token' });

    await setAuthorizationToken({ client, options: { projectToken: 'test' } } as any);
    expect(client.setAuthorization).toHaveBeenCalledWith('token');
  });
});
