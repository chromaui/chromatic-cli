import { describe, expect, it } from 'vitest';

import fatalError from './fatalError';
import invalidProjectToken from './invalidProjectToken';

const token = 'chpt_fatal-error-test-token';

// Mirror how tasks/auth.ts throws this error: the module's message embeds the token,
// and the Error's stack starts with the same message — so the token reaches the
// message list, the stack traces, and the debug info.
const error = new Error(invalidProjectToken({ projectToken: token }));

const setupContext = (ctx: Record<string, unknown> = {}) =>
  ctx as unknown as Parameters<typeof fatalError>[0];

describe('fatalError credential redaction', () => {
  it('scrubs a flag-supplied project token from the message, stack, and debug info', () => {
    const ctx = setupContext({
      flags: { projectToken: [token] },
      sessionId: 'session-test',
      pkg: {
        name: 'chromatic',
        version: '0.0.0-test',
        bugs: { email: 'support@example.com' },
        docs: 'https://www.chromatic.com/docs',
      },
      packageJson: {},
      env: {},
      git: {
        version: 'git version 2.51.0',
        branch: 'main',
        slug: 'chromaui/chromatic-cli',
        fromCI: true,
      },
      exitCode: 202,
      exitCodeKey: 'BUILD_FAILED',
    });

    const output = fatalError(ctx, error);

    expect(output).not.toContain(token);
    expect(output).toContain('<redacted>');
    // The flag key stays visible in the debug info with its value redacted.
    expect(output).toContain('"projectToken"');
  });

  it('scrubs a project token supplied only through the environment', () => {
    const ctx = setupContext({
      flags: {},
      sessionId: 'session-test',
      pkg: {
        name: 'chromatic',
        version: '0.0.0-test',
        bugs: { email: 'support@example.com' },
        docs: 'https://www.chromatic.com/docs',
      },
      packageJson: {},
      env: { CHROMATIC_PROJECT_TOKEN: token },
      git: {
        version: 'git version 2.51.0',
        branch: 'main',
        slug: 'chromaui/chromatic-cli',
        fromCI: false,
      },
      exitCode: 202,
      exitCodeKey: 'BUILD_FAILED',
    });

    const output = fatalError(ctx, error);

    expect(output).not.toContain(token);
    expect(output).toContain('<redacted>');
  });
});
