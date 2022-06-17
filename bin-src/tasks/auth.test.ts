import { getAppInfo, setAuthorizationToken } from './auth';

describe('setAuthorizationToken', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    client.runQuery.mockReturnValue({ createAppToken: 'token' });

    await setAuthorizationToken({ client, options: { projectToken: 'test' } } as any);
    expect(client.setAuthorization).toHaveBeenCalledWith('token');
  });
});

describe('getAppInfo', () => {
  it('retreives onboarding info using project token', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    client.runQuery.mockReturnValue({ appByCode: { isOnboarding: true } });

    const ctx = {
      client,
      options: { projectToken: 'test' },
      isOnboarding: false,
    };

    await getAppInfo(ctx as any);
    expect(ctx.isOnboarding).toBeTruthy();
  });
});
