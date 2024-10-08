import * as Sentry from '@sentry/node';
import stripAnsi from 'strip-ansi';

/**
 * Remove ANSI escape codes from Sentry ErrorEvents.
 *
 * @param event An event containing a captured exception.
 *
 * @returns The modified event.
 */
export function filterErrorEvent(event: Sentry.ErrorEvent) {
  // Remove ANSI escape codes from error messages
  if (event.message) {
    event.message = stripAnsi(event.message);
  }
  // And from exception messages
  if (event.exception?.values) {
    for (const [index, exception] of event.exception.values.entries()) {
      if (exception.value) {
        event.exception.values[index].value = stripAnsi(exception.value);
      }
    }
  }
  return event;
}

/**
 * Remove ANSI escape codes from console breadcrumbs, and skip breadcrumbs for empty lines.
 *
 * @param breadcrumb A breadcrumb captured by Sentry.
 *
 * @returns The modified breadcrumb, or `null` when it is not desired.
 */
export function filterBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  if (breadcrumb.category === 'console') {
    // Do not send breadcrumbs for console newlines
    if (breadcrumb.message === '') {
      // eslint-disable-next-line unicorn/no-null
      return null;
    }
    // Otherwise remove ANSI escape codes
    if (breadcrumb.message) {
      breadcrumb.message = stripAnsi(breadcrumb.message);
    }
  }
  return breadcrumb;
}

Sentry.init({
  dsn: 'https://4fa173db2ef3fb073b8ea153a5466d28@o4504181686599680.ingest.us.sentry.io/4507930289373184',
  release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
  dist: process.env.SENTRY_DIST,
  sampleRate: 1,
  environment: process.env.SENTRY_ENVIRONMENT,
  enabled:
    process.env.DISABLE_ERROR_MONITORING !== 'true' &&
    process.env.SENTRY_ENVIRONMENT !== 'development',
  enableTracing: false,
  integrations: [],
  initialScope: {
    tags: {
      version: process.env.npm_package_version,
      index_url: process.env.CHROMATIC_INDEX_URL,
    },
  },
  beforeSend: filterErrorEvent,
  beforeBreadcrumb: filterBreadcrumb,
});
