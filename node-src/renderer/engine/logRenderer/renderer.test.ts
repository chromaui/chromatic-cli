import { describe, expect, it } from 'vitest';

import { logRenderer } from './renderer';

/**
 * Collects the lines passed to the injected `logFunction` so tests can assert on the exact
 * log output the renderer would produce.
 *
 * @returns A `logFunction` sink plus the `lines` array it records into.
 */
function recordingLogFunction() {
  const lines: string[] = [];
  return { logFunction: (message: string) => lines.push(message), lines };
}

describe('logRenderer', () => {
  it('emits the title then the output line on start', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.start({
      status: 'pending',
      title: 'Authenticating',
      output: 'Connecting to Chromatic',
    });

    expect(lines).toEqual(['Authenticating', '    → Connecting to Chromatic']);
  });

  it('emits only the output line on update, not the title', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.update({ status: 'pending', title: 'Authenticating', output: 'Still working' });

    expect(lines).toEqual(['    → Still working']);
  });

  it('emits the title then the output line on succeed', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.succeed({ status: 'success', title: 'Authenticated', output: 'Using token ****1234' });

    expect(lines).toEqual(['Authenticated', '    → Using token ****1234']);
  });

  it('emits the title then the output line on fail', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.fail({ status: 'error', title: 'Authentication failed', output: 'invalid token' });

    expect(lines).toEqual(['Authentication failed', '    → invalid token']);
  });

  it('emits only the title when there is no output', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.start({ status: 'pending', title: 'Authenticating' });

    expect(lines).toEqual(['Authenticating']);
  });

  it('emits nothing on update when there is no output', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.update({ status: 'pending', title: 'Authenticating' });

    expect(lines).toEqual([]);
  });

  it('dedupes consecutive identical output across hooks', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    // Note the first call is start, then two updates. But output is identical, so still deduped.
    renderer.start({ status: 'pending', title: 'Uploading', output: 'Sending files' });
    renderer.update({ status: 'pending', title: 'Uploading', output: 'Sending files' });
    renderer.update({ status: 'pending', title: 'Uploading', output: 'Sending files' });

    expect(lines).toEqual(['Uploading', '    → Sending files']);
  });

  it('re-emits output when it changes and again when it reverts', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.update({ status: 'pending', title: 'Uploading', output: 'A' });
    renderer.update({ status: 'pending', title: 'Uploading', output: 'B' });
    renderer.update({ status: 'pending', title: 'Uploading', output: 'A' });

    expect(lines).toEqual(['    → A', '    → B', '    → A']);
  });

  it('passes multi-line output through as a single arrow-prefixed string', () => {
    const { logFunction, lines } = recordingLogFunction();
    const renderer = logRenderer(logFunction);

    renderer.fail({ status: 'error', title: 'Failed', output: 'line one\nline two' });

    expect(lines).toEqual(['Failed', '    → line one\nline two']);
  });
});
