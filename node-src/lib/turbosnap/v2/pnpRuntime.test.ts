import * as Sentry from '@sentry/node';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { allowPnpRuntime, VersionNotFoundError } from '../../installedPackages';
import TestLogger from '../../testLogger';
import { loadPnpRuntime } from './pnpRuntime';

vi.mock('@sentry/node');

const zipStats = {
  modules: [
    { id: './src/Button.stories.tsx', name: './src/Button.stories.tsx' },
    {
      id: './.yarn/__virtual__/react-virtual-1/0/cache/react-npm-19.0.0-1.zip/node_modules/react/index.js',
      name: './.yarn/__virtual__/react-virtual-1/0/cache/react-npm-19.0.0-1.zip/node_modules/react/index.js + 1 modules',
    },
  ],
};

let root: string;
let configDirectory: string;

// A project with a `.pnp.cjs` at its root whose `setup` runs `setupBody`.
function writePnpFile(setupBody: string) {
  writeFileSync(path.join(root, '.pnp.cjs'), `exports.setup = () => { ${setupBody} };`);
}

function load(stats = zipStats) {
  loadPnpRuntime(stats, { configDir: configDirectory, log: new TestLogger() });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pnp-'));
  configDirectory = path.join(root, 'packages/ui/.storybook');
  mkdirSync(configDirectory, { recursive: true });
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).pnpSetUp;
  rmSync(root, { recursive: true, force: true });
});

// `allowPnpRuntime` can't be undone, so the refusal without it runs before any test that calls it.
describe('loadPnpRuntime', () => {
  it('does not look for a runtime when no stats path is inside a zip archive', () => {
    writePnpFile('globalThis.pnpSetUp = true;');

    load({
      modules: [{ id: './node_modules/react/index.js', name: './node_modules/react/index.js' }],
    });
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBeUndefined();
  });

  it('refuses without loading the runtime unless an entry point allowed it', () => {
    writePnpFile('globalThis.pnpSetUp = true;');

    expect(() => load()).toThrow(VersionNotFoundError);
    expect(() => load()).toThrow("runtime isn't loaded");
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBeUndefined();
  });

  it('refuses when no .pnp.cjs is in the config directory or above it', () => {
    allowPnpRuntime();

    expect(() => load()).toThrow(VersionNotFoundError);
    expect(() => load()).toThrow('there is no .pnp.cjs');
  });

  it('loads and sets up the runtime found above the config directory', () => {
    allowPnpRuntime();
    writePnpFile('globalThis.pnpSetUp = true;');

    load();
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('leaves a runtime that is already active alone', () => {
    allowPnpRuntime();
    writePnpFile('globalThis.pnpSetUp = true;');
    process.versions.pnp = '3';
    try {
      load();
    } finally {
      delete (process.versions as Record<string, string | undefined>).pnp;
    }
    expect((globalThis as Record<string, unknown>).pnpSetUp).toBeUndefined();
  });

  it('reports a runtime that fails to set up under a fingerprint without its path, then refuses', () => {
    allowPnpRuntime();
    writePnpFile(`throw Object.assign(new Error('broken at ${root}'), { code: 'EBROKEN' });`);

    expect(() => load()).toThrow(VersionNotFoundError);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      fingerprint: ['turbosnap-v2', 'pnp-runtime', 'EBROKEN'],
    });
  });
});
