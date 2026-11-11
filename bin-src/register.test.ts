import { afterEach, describe, expect, it, vi } from 'vitest';

const traceMain = vi.hoisted(() => vi.fn());
vi.mock('./trace', () => ({ main: traceMain }));

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runSubcommand(rejection: unknown) {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  traceMain.mockRejectedValue(rejection);
  process.argv = ['node', 'chromatic', 'trace'];
  await import('./register');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  return consoleError.mock.calls.flat().map(String).join('\n');
}

describe('register', () => {
  it('exits 1 with only the message when a subcommand throws', async () => {
    const error = Object.assign(new Error('Unable to trace package manifest file'), {
      envPairs: ['CHROMATIC_PROJECT_TOKEN=chpt_secret'],
    });
    const output = await runSubcommand(error);
    expect(output).toBe('Error: Unable to trace package manifest file');
  });

  it('does not serialize a non-Error rejection', async () => {
    const output = await runSubcommand({ envPairs: ['CHROMATIC_PROJECT_TOKEN=chpt_secret'] });
    expect(output).not.toContain('chpt_secret');
  });
});
