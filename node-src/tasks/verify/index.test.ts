import { describe, expect, it, vi } from 'vitest';

import { exitCodes } from '../../lib/setExitCode';
import { applyVerifyOutput, verifyProject } from './index';

vi.mock('./publishBuild');
vi.mock('./verifyBuild');

const baseOutput = {
  announcedBuild: { number: 1 },
  storybookUrl: 'https://chromatic.com/build',
  build: { number: 1 },
  isPublishOnly: false,
  skipSnapshots: false,
} as any;

describe('applyVerifyOutput', () => {
  it('applies build metadata to context', () => {
    const ctx = {} as any;
    applyVerifyOutput(ctx, baseOutput);
    expect(ctx.announcedBuild).toEqual({ number: 1 });
    expect(ctx.storybookUrl).toBe('https://chromatic.com/build');
    expect(ctx.build).toEqual({ number: 1 });
    expect(ctx.isPublishOnly).toBe(false);
    expect(ctx.skipSnapshots).toBe(undefined);
    expect(ctx.exitCode).toBe(undefined);
  });

  it('applies a limit exit code', () => {
    const ctx = {} as any;
    applyVerifyOutput(ctx, {
      ...baseOutput,
      limitExitCode: { code: exitCodes.ACCOUNT_QUOTA_REACHED, userError: true },
    });
    expect(ctx.exitCode).toBe(exitCodes.ACCOUNT_QUOTA_REACHED);
    expect(ctx.userError).toBe(true);
  });

  it('sets OK and skipSnapshots, overriding a limit exit code', () => {
    const ctx = {} as any;
    applyVerifyOutput(ctx, {
      ...baseOutput,
      skipSnapshots: true,
      limitExitCode: { code: exitCodes.ACCOUNT_QUOTA_REACHED, userError: true },
    });
    expect(ctx.skipSnapshots).toBe(true);
    expect(ctx.exitCode).toBe(exitCodes.OK);
  });
});

describe('verifyProject', () => {
  it('skips itself on a dry run without publishing', async () => {
    const result = await verifyProject({ options: { dryRun: true } } as any, {} as any);
    expect(result).toEqual({ kind: 'skip-self' });
  });
});
