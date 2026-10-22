import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { renderUpload } from './upload';

vi.mock('../tasks/upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tasks/upload')>()),
  uploadProject: vi.fn(async (deps: any) => {
    deps.log.info('This build was skipped');
    return { kind: 'partial', output: {} };
  }),
}));

describe('renderUpload', () => {
  it('does not log the pending title after a TurboSnap-skipped build', async () => {
    const ctx = { env: {}, log: new TestLogger(), options: {} } as any;

    await renderUpload(ctx);

    const lines = vi.mocked(ctx.log.info).mock.calls.map(([line]) => line);
    expect(lines.slice(lines.indexOf('This build was skipped'))).toEqual([
      'This build was skipped',
      'Publish skipped',
    ]);
    expect(ctx.skip).toBe(true);
  });
});
