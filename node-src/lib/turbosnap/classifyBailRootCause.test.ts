import { describe, expect, it, vi } from 'vitest';

import { getChangedFilesWithStatus as getChangedFilesWithStatusDep } from '../../git/git';
import TestLogger from '../testLogger';
import { classifyBaselineCheckoutFailure } from './classifyBailRootCause';
import { BaselineCheckoutFailedError, LockFileParseFailedError } from './errors';

vi.mock('../../git/git');
const getChangedFilesWithStatus = vi.mocked(getChangedFilesWithStatusDep);

const deps = { log: new TestLogger(), options: {} } as any;

describe('classifyBaselineCheckoutFailure', () => {
  it('returns undefined for a non-BaselineCheckoutFailedError', async () => {
    const result = await classifyBaselineCheckoutFailure(
      deps,
      new LockFileParseFailedError('/tmp/checkout-abc/yarn.lock')
    );

    expect(result).toBeUndefined();
    expect(getChangedFilesWithStatus).not.toHaveBeenCalled();
  });

  describe('BaselineCheckoutFailedError', () => {
    it('classifies a file rename as "baselineManifestMoved"', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'renamed', fromPath: 'libs/old/package.json', path: 'libs/app/package.json' },
      ]);

    const result = await classifyBaselineCheckoutFailure(
      deps,
      new BaselineCheckoutFailedError('abc123:libs/app/package.json')
    );

    expect(result).toBe('baselineManifestMoved');
  });

    it('classifies a file add as "baselineManifestAdded"', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'added', path: 'libs/app/package.json' },
      ]);

    const result = await classifyBaselineCheckoutFailure(
      deps,
      new BaselineCheckoutFailedError('abc123:libs/app/package.json')
    );

    expect(result).toBe('baselineManifestAdded');
  });

    it('classifies a file rename as "baselineManifestMoved" over "baselineManifestAdded" when the diff has both rows', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'added', path: 'libs/app/package.json' },
        { status: 'renamed', fromPath: 'libs/old/package.json', path: 'libs/app/package.json' },
      ]);

    const result = await classifyBaselineCheckoutFailure(
      deps,
      new BaselineCheckoutFailedError('abc123:libs/app/package.json')
    );

    expect(result).toBe('baselineManifestMoved');
  });

    it('returns "unknownBaselineCheckoutFailure" when we cannot classify the change', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'modified', path: 'some/other/package.json' },
      ]);

    const result = await classifyBaselineCheckoutFailure(
      deps,
      new BaselineCheckoutFailedError('abc123:libs/app/package.json')
    );

    expect(result).toBe('unknownBaselineCheckoutFailure');
  });

    it('returns "unknownBaselineCheckoutFailure" when a git command throws unexpectedly', async () => {
      getChangedFilesWithStatus.mockRejectedValue(new Error('git diff blew up'));

    const result = await classifyBaselineCheckoutFailure(
      deps,
      new BaselineCheckoutFailedError('abc123:libs/app/package.json')
    );

    expect(result).toBe('unknownBaselineCheckoutFailure');
  });
});
