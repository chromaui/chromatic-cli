import openTunnel from '../lib/tunnel';
import { createTunnel, testConnection } from './tunnel';

jest.mock('../lib/tunnel');

const log = { debug: jest.fn() };

describe('createTunnel', () => {
  it('opens the tunnel and sets the isolatorUrl on context', async () => {
    openTunnel.mockReturnValue({ url: 'https://tunnel.chromaticqa.com' });

    const ctx = { log, isolatorUrl: 'http://localhost:9001', options: {} };
    await createTunnel(ctx);

    expect(openTunnel).toHaveBeenCalledWith({ log, port: '9001', https: undefined });
    expect(ctx.isolatorUrl).toBe('https://tunnel.chromaticqa.com/');
  });
});

describe('testConnection', () => {
  it('tries to fetch the isolatorUrl', async () => {
    const http = { fetch: jest.fn() };
    await testConnection({ env: {}, log, http, isolatorUrl: 'https://tunnel.chromaticqa.com' });
    expect(http.fetch).toHaveBeenCalledWith('https://tunnel.chromaticqa.com');
  });
});
