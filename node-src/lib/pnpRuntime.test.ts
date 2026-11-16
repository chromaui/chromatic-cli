import * as Sentry from '@sentry/node';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from './testLogger';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  delete (globalThis as any).pnpSetupCalls;
});

// A stand-in for the `.pnp.cjs` Yarn generates, whose `setup` runs the given body.
function pnpProject(setupBody: string, header = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'pnp-runtime-'));
  roots.push(root);
  const pnpFile = path.join(root, '.pnp.cjs');
  writeFileSync(pnpFile, `${header}\nmodule.exports = { setup() { ${setupBody} } };`);
  return {
    layout: 'pnp' as const,
    packageManager: 'yarn' as const,
    installRoot: root,
    pnpFile,
    pnpRuntime: 'inactive' as const,
  };
}

const countSetup = 'globalThis.pnpSetupCalls = (globalThis.pnpSetupCalls ?? 0) + 1;';

// A fresh module per test, since allowing the runtime is process-wide.
async function load({ allow }: { allow: boolean }) {
  vi.resetModules();
  const pnpRuntime = await import('./pnpRuntime');
  if (allow) pnpRuntime.allowProjectPnpRuntime();
  return pnpRuntime.activateProjectPnpRuntime;
}

describe('activateProjectPnpRuntime', () => {
  it('loads the runtime and reports it active once the entry point allows it', async () => {
    const activate = await load({ allow: true });
    const setup = pnpProject(countSetup);

    expect(activate(setup, new TestLogger())).toEqual({ ...setup, pnpRuntime: 'active' });
    expect((globalThis as any).pnpSetupCalls).toBe(1);
  });

  it('leaves the runtime alone unless an entry point allowed it, as for chromatic/node', async () => {
    const activate = await load({ allow: false });
    const setup = pnpProject(countSetup);

    expect(activate(setup, new TestLogger())).toBe(setup);
    expect((globalThis as any).pnpSetupCalls).toBeUndefined();
  });

  it('leaves a runtime that is already active alone', async () => {
    const activate = await load({ allow: true });
    const setup = { ...pnpProject(countSetup), pnpRuntime: 'active' as const };

    expect(activate(setup, new TestLogger())).toBe(setup);
    expect((globalThis as any).pnpSetupCalls).toBeUndefined();
  });

  it.each([
    ['setup', (message: string) => pnpProject(`throw new TypeError('${message}');`), 'TypeError'],
    [
      'load',
      // A coded error, as Yarn's runtime throws: the code tells failures apart better than the class.
      (message: string) =>
        pnpProject('', `throw Object.assign(new Error('${message}'), { code: 'ERR_PNP_TEST' });`),
      'ERR_PNP_TEST',
    ],
  ])(
    'reports a failure to %s once, grouped by phase and kind rather than path or message',
    async (phase, project, kind) => {
      const activate = await load({ allow: true });
      const fingerprints: unknown[] = [];
      for (const message of ['first wording', 'second wording']) {
        vi.mocked(Sentry.captureException).mockClear();
        const setup = project(message);

        expect(activate(setup, new TestLogger())).toEqual({ ...setup, pnpRuntime: 'failed' });

        expect(Sentry.captureException).toHaveBeenCalledOnce();
        const [error, hint] = vi.mocked(Sentry.captureException).mock.calls[0];
        expect((error as Error).message).toBe(message);
        expect((hint as any).contexts.pnp_runtime.pnpFile).toBe(setup.pnpFile);
        fingerprints.push((hint as any).fingerprint);
      }

      const expected = ['turbosnap-v2', 'pnp-runtime', phase, kind];
      expect(fingerprints).toEqual([expected, expected]);
    }
  );
});
