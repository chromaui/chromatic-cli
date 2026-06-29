import { describe, expect, it } from 'vitest';

import TestLogger from '../lib/testLogger';
import { renderSnapshot } from './snapshot';

// `actualTestCount: 0` keeps the `pending` transition off the stats path (it needs only the count),
// so these fixtures stay minimal. The snapshot task self-skips before touching anything else.
const createContext = (overrides: any) =>
  ({
    client: { runQuery: () => undefined },
    env: {},
    log: new TestLogger(),
    git: { matchesBranch: () => false },
    build: { actualTestCount: 0 },
    options: {},
    ...overrides,
  }) as any;

describe('renderSnapshot skip frames', () => {
  it('renders the dry-run frame and does not set an exit code', async () => {
    const ctx = createContext({ options: { dryRun: true } });

    await renderSnapshot(ctx);

    expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('Skipped due to --dry-run'));
    expect(ctx.exitCode).toBeUndefined();
  });

  it('renders the dry-run frame when ctx.build is undefined', async () => {
    const ctx = createContext({ options: { dryRun: true }, build: undefined });

    await expect(renderSnapshot(ctx)).resolves.toBeUndefined();

    expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('Skipped due to --dry-run'));
    expect(ctx.exitCode).toBeUndefined();
  });

  it('renders the publish-only skip frame when ctx.skipSnapshots is set', async () => {
    const ctx = createContext({ skipSnapshots: true, isPublishOnly: true });

    await renderSnapshot(ctx);

    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('No UI tests or UI review enabled')
    );
    expect(ctx.exitCode).toBeUndefined();
  });

  it('renders the --exit-once-uploaded skip frame when ctx.skipSnapshots is set', async () => {
    const ctx = createContext({ skipSnapshots: true });

    await renderSnapshot(ctx);

    expect(ctx.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipped due to --exit-once-uploaded')
    );
  });
});
