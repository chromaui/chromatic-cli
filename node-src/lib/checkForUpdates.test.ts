import { beforeEach, describe, expect, it, vi } from 'vitest';

import checkForUpdates from './checkForUpdates';
import TestLogger from './testLogger';

const http = { fetch: vi.fn() };
const pkgMgrExec = vi.fn();
const pkgMgrHasYarn = vi.fn(() => false);
const captureException = vi.fn();

const getContext = (skipUpdateCheck = false, version = '13.0.0') => {
  return {
    options: { skipUpdateCheck },
    log: new TestLogger(),
    http,
    pkg: { name: 'chromatic', version },
    ports: {
      pkgMgr: { exec: pkgMgrExec, hasYarn: pkgMgrHasYarn },
      errors: { captureException },
    },
  };
};

beforeEach(() => {
  pkgMgrExec.mockReset().mockResolvedValue('https://registry.npmjs.org/');
  pkgMgrHasYarn.mockReset().mockReturnValue(false);
  captureException.mockReset();
});

describe('checkForUpdates', () => {
  it('skips update check when "skipUpdateCheck" option is true', async () => {
    const ctx = getContext(true);
    await checkForUpdates(ctx as any);
    expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('Skipping update check'));
    expect(ctx.http.fetch).not.toHaveBeenCalled();
  });

  it('skips update check with a warning when the version is invalid', async () => {
    const ctx = getContext(false, 'invalid-version');
    await checkForUpdates(ctx as any);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid semver version in package.json')
    );
    expect(ctx.http.fetch).not.toHaveBeenCalled();
  });

  describe('registry url', () => {
    it('defaults to the npm registry on error', async () => {
      const ctx = getContext();
      pkgMgrExec.mockRejectedValue(new Error('spawn error'));
      await checkForUpdates(ctx as any);
      expect(pkgMgrExec).toHaveBeenCalledWith(['config', 'get', 'registry']);
      expect(ctx.http.fetch).toHaveBeenCalledWith('https://registry.npmjs.org/chromatic');
    });

    it('uses custom registries', async () => {
      const ctx = getContext();
      pkgMgrExec.mockResolvedValue('https://custom-registry.example.com/');
      await checkForUpdates(ctx as any);
      expect(pkgMgrExec).toHaveBeenCalledWith(['config', 'get', 'registry']);
      expect(ctx.log.info).toHaveBeenCalledWith(
        expect.stringContaining('https://custom-registry.example.com/')
      );
      expect(ctx.http.fetch).toHaveBeenCalledWith('https://custom-registry.example.com/chromatic');
    });
  });

  describe('registry fetch errors', () => {
    it('does not report invalid URL errors', async () => {
      const ctx = getContext();
      pkgMgrExec.mockResolvedValue('invalid-url');
      await checkForUpdates(ctx as any);
      // it should throw before the fetch
      expect(ctx.http.fetch).not.toHaveBeenCalled();
      // but it should not report to Sentry
      expect(captureException).not.toHaveBeenCalled();
      // http.fetch.mockRejectedValue(new Error('fetch failed'));
    });

    it('does not report HTTP fetch errors', async () => {
      const ctx = getContext();
      http.fetch.mockRejectedValue(
        new Error(
          'HTTPClient failed to fetch https://npm.example.com/repository/npm/chromatic, got 401/Unauthorized'
        )
      );
      await checkForUpdates(ctx as any);
      expect(captureException).not.toHaveBeenCalled();
    });
  });
});
