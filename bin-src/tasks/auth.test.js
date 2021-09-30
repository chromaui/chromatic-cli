import { setAuthorizationToken } from './auth';

describe('setAuthorizationToken', () => {
  it('updates the GraphQL client with an app token from the index', async () => {
    const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };
    client.runQuery.mockReturnValue({ createAppToken: 'token' });

    await setAuthorizationToken({ client, options: { projectToken: 'test' } });
    expect(client.setAuthorization).toHaveBeenCalledWith('token');
  });
});
