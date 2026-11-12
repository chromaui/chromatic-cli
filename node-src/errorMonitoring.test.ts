import './errorMonitoring';

import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

// The filters are tested through the options the module passes to `Sentry.init`.
const { beforeBreadcrumb, beforeSend } = Sentry.getClient()?.getOptions() ?? {};
const filterErrorEvent = (event: Sentry.ErrorEvent, hint: Sentry.EventHint = {}) =>
  beforeSend?.(event, hint) as Sentry.ErrorEvent;
const filterBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => beforeBreadcrumb?.(breadcrumb);

const redError = chalk.red('error');
const blueMessage = chalk.blue('message');

describe('filterErrorEvent', () => {
  it('removes ANSI from error.message', () => {
    const actual = filterErrorEvent({ message: redError } as Sentry.ErrorEvent);
    expect(actual.message).toBe('error');
  });

  it('remove ANSI from exceptions', () => {
    const actual = filterErrorEvent({
      exception: { values: [{ value: redError }, { value: redError }] },
    } as Sentry.ErrorEvent);
    expect(actual.exception?.values?.[0].value).toBe('error');
    expect(actual.exception?.values?.[1].value).toBe('error');
  });
});

describe('filterBreadcrumb', () => {
  it('does nothing with non-console breadcrumbs', () => {
    const breadcrumb = { category: 'http', message: blueMessage } as Sentry.Breadcrumb;
    const actual = filterBreadcrumb(breadcrumb);
    expect(actual).toBe(breadcrumb);
  });

  it('removes ANSI from console breadcrumb messages', () => {
    const actual = filterBreadcrumb({
      category: 'console',
      message: blueMessage,
    } as Sentry.Breadcrumb);
    expect(actual?.message).toBe('message');
  });

  it('returns null for empty console breadcrumbs', () => {
    const actual = filterBreadcrumb({
      category: 'console',
      message: '',
    } as Sentry.Breadcrumb);
    expect(actual).toBeNull();
  });
});
