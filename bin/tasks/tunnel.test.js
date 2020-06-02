import fetch from 'node-fetch';

import openTunnel from '../lib/tunnel';
import { createTunnel, testConnection } from './tunnel';

jest.mock('node-fetch');
jest.mock('../lib/tunnel');

const log = { debug: jest.fn() };

describe('createTunnel', () => {
  it('opens the tunnel and sets the isolatorUrl on context', async () => {
    openTunnel.mockReturnValue({ url: 'https://tunnel.chromatic.com' });

    const ctx = { log, isolatorUrl: 'http://localhost:9001', options: {} };
    await createTunnel(ctx);

    expect(openTunnel).toHaveBeenCalledWith({ log, port: '9001', https: undefined });
    expect(ctx.isolatorUrl).toBe('https://tunnel.chromatic.com/');
  });
});

describe('testConnection', () => {
  it('tries to fetch the isolatorUrl', async () => {
    testConnection({ isolatorUrl: 'https://tunnel.chromatic.com' });
    expect(fetch).toHaveBeenCalledWith('https://tunnel.chromatic.com');
  });
});
