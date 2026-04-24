import { describe, expect, it, vi } from 'vitest';

import { setAuthorizationToken } from './auth';

describe('setAuthorizationToken', () => {
  it('updates the ChromaticApi with an app token from the index', async () => {
    const chromatic = {
      createAppToken: vi.fn().mockResolvedValue('app-token'),
      setAuthorization: vi.fn(),
    };

    await setAuthorizationToken({
      ports: { chromatic },
      options: { projectToken: 'test' },
    } as any);
    expect(chromatic.setAuthorization).toHaveBeenCalledWith('app-token');
  });

  it('supports projectId + userToken', async () => {
    const chromatic = {
      createCliToken: vi.fn().mockResolvedValue('cli-token'),
      setAuthorization: vi.fn(),
    };

    await setAuthorizationToken({
      ports: { chromatic },
      env: { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' },
      options: { projectId: 'Project:abc123', userToken: 'user-token' },
    } as any);
    expect(chromatic.setAuthorization).toHaveBeenCalledWith('cli-token');
  });
});
