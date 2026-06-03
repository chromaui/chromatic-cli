import * as Sentry from '@sentry/node';

/**
 * Report a bail-causing error to Sentry and return the resulting event ID.
 *
 * Known bail reasons are grouped under one Sentry issue per `bailSubreason` via `fingerprint`.
 * Unclassified errors are left to Sentry's default grouping so they don't all collapse into a
 * single bucket.
 *
 * @param error The thrown value that caused the bail.
 * @param options Bail context.
 * @param options.bailSubreason The classified subreason, or `undefined` to use default Sentry grouping.
 * @param options.bailPath A stable identifier for the bail site (used as the `bail_path` tag).
 *
 * @returns The Sentry event ID for the captured exception.
 */
export function captureBailException(
  error: unknown,
  { bailSubreason, bailPath }: { bailSubreason: string | undefined; bailPath: string }
): string {
  return Sentry.captureException(error, {
    tags: { bail_path: bailPath, bail_detail: bailSubreason },
    ...(bailSubreason && { fingerprint: [bailSubreason] }),
  });
}
