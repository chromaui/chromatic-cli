import * as Sentry from '@sentry/node';
import { ExecaError, parseCommandString } from 'execa';
import stripAnsi from 'strip-ansi';

import { getRedactedSecrets } from './lib/log';
import { scrubSecrets } from './lib/utilities';

/**
 * Groups a failed git command by its subcommand and how it failed, rather than by its message.
 * The message holds the full command line and exit code or signal, so Sentry would otherwise open a
 * new issue for every branch name, path, flag, or signal.
 *
 * @param error The captured exception, which for a failed command is execa's error.
 *
 * @returns The fingerprint, or `undefined` when the error is not a failed git command.
 */
function gitCommandFingerprint(error: unknown): string[] | undefined {
  if (!(error instanceof ExecaError)) return;
  const [program, ...args] = parseCommandString(error.command);
  if (program !== 'git') return;
  // A command with only options, such as `git --version`, is named by its first one. Options
  // before the subcommand must use the `--option=value` form: the separate value of `-c` or `-C`
  // would be taken for the subcommand.
  const gitCommand = `git ${args.find((argument) => !argument.startsWith('-')) ?? args[0]}`;

  // execa kills git when its output outgrows the buffer. That repeats on every run, so keep it
  // apart from the kills that come from outside, such as a cancelled CI job.
  if (error.isMaxBuffer) return ['git-command-max-buffer', gitCommand];
  // A shell reports a child killed by signal N as exit code 128 + N. Git itself exits with 128
  // (fatal) or 129 (usage), so only higher codes mean a signal, such as 143 for SIGTERM.
  if (error.signal || (error.exitCode !== undefined && error.exitCode > 129)) {
    return ['git-command-killed', gitCommand];
  }
  // A command that never started, such as one with a missing `cwd`, has no exit code.
  return ['git-command-failed', gitCommand, `exit code ${error.exitCode ?? 'none'}`];
}

/**
 * Remove ANSI escape codes from Sentry ErrorEvents, group failed git commands by subcommand, and
 * redact the logger's secrets.
 *
 * @param event An event containing a captured exception.
 * @param hint The event hint, which holds the original exception.
 *
 * @returns The modified event.
 */
function filterErrorEvent(event: Sentry.ErrorEvent, hint: Sentry.EventHint) {
  // A fingerprint set where the error was captured is more specific, so keep it.
  event.fingerprint ??= gitCommandFingerprint(hint.originalException);
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
  // The CLI prints tokens, such as in "Invalid --project-token", and every printed line becomes a
  // breadcrumb on later events. Users sometimes pass other credentials as tokens, so redact them
  // in every string value of the event. Leave out `sdkProcessingMetadata`: it holds Sentry's own
  // scope objects, which have circular references, and the SDK sends only its sampling context.
  const { sdkProcessingMetadata, ...sent } = event;
  return Object.assign(event, scrubSecrets(sent, getRedactedSecrets()));
}

/**
 * Remove ANSI escape codes from console breadcrumbs, and skip breadcrumbs for empty lines.
 *
 * @param breadcrumb A breadcrumb captured by Sentry.
 *
 * @returns The modified breadcrumb, or `null` when it is not desired.
 */
function filterBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
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
  // Increase max message length to prevent truncation of long error messages
  // Default is 250
  // Max is 8192
  maxValueLength: 500,
});
