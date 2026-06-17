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
 * @param options.additionalTags Extra tags to attach, e.g. a refined root-cause classification.
 *
 * @returns The Sentry event ID for the captured exception.
 */
export function captureBailException(
  error: unknown,
  {
    bailSubreason,
    bailPath,
    additionalTags,
  }: {
    bailSubreason: string | undefined;
    bailPath: string;
    additionalTags?: Record<string, string>;
  }
): string {
  return Sentry.captureException(error, {
    tags: {
      bail_path: bailPath,
      ...(bailSubreason && { bail_detail: bailSubreason }),
      ...additionalTags,
    },
    ...(bailSubreason && { fingerprint: [bailSubreason] }),
  });
}
