import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import { captureBailException } from './captureBailException';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(() => 'sentry-event-id'),
}));

describe('captureBailException', () => {
  it.each(['invalidStoryFileHashes', 'invalidBuildStatus', 'invalidResponse'])(
    'groups %s under its own fingerprint',
    (bailSubreason) => {
      const error = new Error('the Index rejected the hash upload');

      expect(
        captureBailException(error, { bailSubreason, bailPath: 'determineChangedFiles' })
      ).toBe('sentry-event-id');
      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        tags: { bail_path: 'determineChangedFiles', bail_detail: bailSubreason },
        fingerprint: [bailSubreason],
      });
    }
  );

  it('leaves an unclassified error to default grouping', () => {
    const error = new Error('something unexpected');

    captureBailException(error, { bailSubreason: undefined, bailPath: 'determineChangedFiles' });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { bail_path: 'determineChangedFiles' },
    });
  });
});
