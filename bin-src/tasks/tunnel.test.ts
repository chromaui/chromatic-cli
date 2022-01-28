import * as tunnel from '../lib/tunnel';
import { createTunnel, testConnection } from './tunnel';

jest.mock('../lib/tunnel');

const openTunnel = <jest.MockedFunction<typeof tunnel.default>>tunnel.default;

const log = { debug: jest.fn() };

describe('createTunnel', () => {
  it('opens the tunnel and sets the isolatorUrl on context', async () => {
    openTunnel.mockResolvedValue({ url: 'https://tunnel.chromaticqa.com' } as any);

    const ctx = { log, isolatorUrl: 'http://localhost:9001', options: {} } as any;
    await createTunnel(ctx);

    expect(openTunnel).toHaveBeenCalledWith(expect.objectContaining(ctx), {
      port: '9001',
    });
    expect(ctx.isolatorUrl).toBe('https://tunnel.chromaticqa.com/');
  });
});

describe('testConnection', () => {
  it('tries to fetch the isolatorUrl', async () => {
    const http = { fetch: jest.fn() };
    const ctx = { env: {}, log, http, isolatorUrl: 'https://tunnel.chromaticqa.com' } as any;
    await testConnection(ctx);
    expect(http.fetch).toHaveBeenCalledWith('https://tunnel.chromaticqa.com');
  });
});
