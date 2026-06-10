import { describe, expect, it, vi } from 'vitest';

import { getChangedFilesWithStatus as getChangedFilesWithStatusDep } from '../../git/git';
import TestLogger from '../testLogger';
import { classifyTagsFromError } from './classifyBailRootCause';
import { BaselineCheckoutFailedError } from './errors';

vi.mock('../../git/git');
const getChangedFilesWithStatus = vi.mocked(getChangedFilesWithStatusDep);

const deps = { log: new TestLogger(), options: {} } as any;

describe('classifyTagsFromError', () => {
  it('returns undefined for an error that is not classified yet', async () => {
    const result = await classifyTagsFromError(
      deps,
      new Error("some random error which won't have special handling")
    );

    expect(result).toBeUndefined();
    expect(getChangedFilesWithStatus).not.toHaveBeenCalled();
  });

  describe('BaselineCheckoutFailedError', () => {
    it('classifies a file rename as "baselineManifestMoved"', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'renamed', fromPath: 'libs/old/package.json', path: 'libs/app/package.json' },
      ]);

      const result = await classifyTagsFromError(
        deps,
        new BaselineCheckoutFailedError('abc123:libs/app/package.json')
      );

      expect(result).toEqual({ baseline_failure_kind: 'baselineManifestMoved' });
    });

    it('classifies a file add as "baselineManifestAdded"', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'added', path: 'libs/app/package.json' },
      ]);

      const result = await classifyTagsFromError(
        deps,
        new BaselineCheckoutFailedError('abc123:libs/app/package.json')
      );

      expect(result).toEqual({ baseline_failure_kind: 'baselineManifestAdded' });
    });

    it('classifies a file rename as "baselineManifestMoved" over "baselineManifestAdded" when the diff has both rows', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'added', path: 'libs/app/package.json' },
        { status: 'renamed', fromPath: 'libs/old/package.json', path: 'libs/app/package.json' },
      ]);

      const result = await classifyTagsFromError(
        deps,
        new BaselineCheckoutFailedError('abc123:libs/app/package.json')
      );

      expect(result).toEqual({ baseline_failure_kind: 'baselineManifestMoved' });
    });

    it('returns "unknownBaselineCheckoutFailure" when we cannot classify the change', async () => {
      getChangedFilesWithStatus.mockResolvedValue([
        { status: 'modified', path: 'some/other/package.json' },
      ]);

      const result = await classifyTagsFromError(
        deps,
        new BaselineCheckoutFailedError('abc123:libs/app/package.json')
      );

      expect(result).toEqual({ baseline_failure_kind: 'unknownBaselineCheckoutFailure' });
    });

    it('returns "unknownBaselineCheckoutFailure" when a git command throws unexpectedly', async () => {
      getChangedFilesWithStatus.mockRejectedValue(new Error('git diff blew up'));

      const result = await classifyTagsFromError(
        deps,
        new BaselineCheckoutFailedError('abc123:libs/app/package.json')
      );

      expect(result).toEqual({ baseline_failure_kind: 'unknownBaselineCheckoutFailure' });
    });
  });
});
