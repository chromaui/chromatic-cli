import * as Sentry from '@sentry/node';

/**
 * Reports a TurboSnap 2.0 failure under a fingerprint we choose, rather than Sentry's default
 * grouping by stack trace. Our bundles are minified, so the frames' function names change with every
 * build, and one failure would otherwise split across issues by release and by CLI or Action bundle.
 *
 * The fingerprint is built only from fixed names and small, stable sets of values, never from a path,
 * a message, a release or a package version. The original error is reported unchanged, so its
 * message and stack still carry those details for debugging.
 *
 * @param error The original error.
 * @param grouping The failure category, then any stable details to split it by.
 * @param contexts Extra structured context for the event.
 */
export function captureTurboSnapFailure(
  error: unknown,
  grouping: [category: string, ...details: string[]],
  contexts?: Record<string, Record<string, unknown>>
) {
  Sentry.captureException(error, {
    fingerprint: ['turbosnap-v2', ...grouping],
    tags: { turbosnap_failure: grouping[0] },
    ...(contexts && { contexts }),
  });
}
