import './errorMonitoring';

import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import { execa, ExecaError } from 'execa';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, onTestFinished } from 'vitest';

import { createLogger } from './lib/log';

// The filters are tested through the options the module passes to `Sentry.init`.
const { beforeBreadcrumb, beforeSend } = Sentry.getClient()?.getOptions() ?? {};
const filterErrorEvent = (event: Sentry.ErrorEvent, hint: Sentry.EventHint = {}) =>
  beforeSend?.(event, hint) as Sentry.ErrorEvent;
const filterBreadcrumb = (breadcrumb: Sentry.Breadcrumb) => beforeBreadcrumb?.(breadcrumb);

const redError = chalk.red('error');
const blueMessage = chalk.blue('message');

// Stands in for a failure that is hard to cause on purpose, such as a shell reporting a killed git.
const execaError = (fields: Partial<ExecaError>) => Object.assign(new ExecaError(), fields);

const fingerprintOf = (originalException: unknown, event = {} as Sentry.ErrorEvent) =>
  filterErrorEvent(event, { originalException }).fingerprint;

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

  it('groups a git command killed by a signal with one whose shell exited 143', async () => {
    // Waits on stdin until killed, like a long listing interrupted by a CI job being cancelled.
    const subprocess = execa('git', ['hash-object', '--stdin']);
    subprocess.kill('SIGTERM');
    const killed = await subprocess.catch((error) => error);

    expect(killed.signal).toBe('SIGTERM');
    expect(fingerprintOf(killed)).toEqual(
      fingerprintOf(execaError({ command: 'git hash-object -w --stdin', exitCode: 143 }))
    );
    expect(fingerprintOf(killed)).not.toEqual(
      fingerprintOf(execaError({ command: 'git hash-object --stdin', exitCode: 128 }))
    );
  });

  it('counts only exit codes above 129 as a signal, since git exits 128 or 129 itself', () => {
    const killed = fingerprintOf(execaError({ command: 'git log', signal: 'SIGTERM' }));
    expect(fingerprintOf(execaError({ command: 'git log', exitCode: 130 }))).toEqual(killed);
    expect(fingerprintOf(execaError({ command: 'git log', exitCode: 129 }))).not.toEqual(killed);
  });

  it('keeps git output that outgrew the buffer apart from killed commands', async () => {
    const overflowed = await execa('git', ['--version'], { maxBuffer: 5 }).catch((error) => error);

    expect(overflowed.isMaxBuffer).toBe(true);
    // Whether git had already exited when execa stopped reading it, only the overflow counts.
    const { command, exitCode, signal } = overflowed;
    expect(fingerprintOf(overflowed)).not.toEqual(
      fingerprintOf(execaError({ command, exitCode, signal }))
    );
    expect(fingerprintOf(overflowed)).not.toEqual(
      fingerprintOf(execaError({ command, signal: 'SIGTERM' }))
    );
  });

  it('groups a failed git command by subcommand and exit code, not its arguments', async () => {
    // A git directory that doesn't exist fails the same way wherever the test runs.
    const gitDirectory = path.join(tmpdir(), `missing-repository-${process.pid}-${Date.now()}`);
    const failed = await execa('git', [
      `--git-dir=${gitDirectory}`,
      'merge-base',
      '--all',
      'feature-a',
      'main',
    ]).catch((error) => error);

    expect(failed.exitCode).toBe(128);
    expect(fingerprintOf(failed)).toEqual(
      fingerprintOf(
        execaError({ command: 'git merge-base --all feature-b develop', exitCode: 128 })
      )
    );
    expect(fingerprintOf(failed)).not.toEqual(
      fingerprintOf(execaError({ command: 'git merge-base --all feature-b develop', exitCode: 1 }))
    );
  });

  it('names a git command with only options by its first option', () => {
    const version = fingerprintOf(execaError({ command: 'git --version', exitCode: 1 }));
    expect(version).toBeDefined();
    expect(version).not.toEqual(
      fingerprintOf(execaError({ command: 'git merge-base --all feature-b develop', exitCode: 1 }))
    );
  });

  it('redacts every logger secret everywhere in the event', () => {
    const token = 'ghp_notARealToken';
    const userToken = 'notARealUserToken';
    const log = createLogger();
    log.setSecrets([token, userToken]);
    onTestFinished(() => log.setSecrets([]));
    // Sentry's own scope objects reference each other, so scrubbing them would never finish.
    const scope: Record<string, unknown> = {};
    scope.self = scope;

    const actual = filterErrorEvent({
      type: undefined,
      message: `failed with ${token}`,
      exception: { values: [{ value: `Invalid --project-token '${token}'` }] },
      breadcrumbs: [{ category: 'console', message: `Invalid --project-token '${token}'` }],
      extra: { argv: ['-t', token, '--user-token', userToken] },
      sdkProcessingMetadata: { scope },
    });

    expect(actual).toMatchObject({
      message: 'failed with <redacted>',
      exception: { values: [{ value: "Invalid --project-token '<redacted>'" }] },
      breadcrumbs: [{ message: "Invalid --project-token '<redacted>'" }],
      extra: { argv: ['-t', '<redacted>', '--user-token', '<redacted>'] },
    });
    expect(actual.sdkProcessingMetadata?.scope).toBe(scope);
  });

  it('leaves other errors and fingerprints set at capture to the default grouping', () => {
    const gitError = execaError({ command: 'git ls-files', exitCode: 143 });
    expect(fingerprintOf(new Error('git ls-files failed'))).toBeUndefined();
    expect(fingerprintOf({ command: 'git ls-files', exitCode: 143 })).toBeUndefined();
    expect(fingerprintOf(execaError({ command: 'yarn install', exitCode: 1 }))).toBeUndefined();
    expect(fingerprintOf(gitError, { fingerprint: ['bail'] } as Sentry.ErrorEvent)).toEqual([
      'bail',
    ]);
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
    });
    expect(actual?.message).toBe('message');
  });

  it('returns null for empty console breadcrumbs', () => {
    const actual = filterBreadcrumb({
      category: 'console',
      message: '',
    });
    expect(actual).toBeNull();
  });
});
