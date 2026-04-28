import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BuildRunner } from './buildRunner';
import { createInMemoryBuildRunner, InMemoryBuildRunnerState } from './buildRunnerInMemoryAdapter';
import { createShellBuildRunner } from './buildRunnerShellAdapter';
import type { ProcessRunner } from './processRunner';

interface AdapterSetup {
  adapter: BuildRunner;
  primeOk: (command: string, logLines?: string[]) => void;
  primeFailure: (command: string, error: Error) => void;
  recordedRuns: () => { command: string; options: any }[];
}

function shellSetup(): AdapterSetup {
  const runs: { command: string; options: any }[] = [];
  const responses = new Map<string, { error?: Error; logLines?: string[] }>();
  const proc: ProcessRunner = {
    run(command, options) {
      runs.push({ command, options });
      const entry = responses.get(command);
      if (entry?.logLines && options?.stdio?.[1]) {
        for (const line of entry.logLines) options.stdio[1].write(line);
      }
      const result = entry?.error
        ? Promise.reject(entry.error)
        : Promise.resolve({ stdout: '', stderr: '', all: '', exitCode: 0 });
      return Object.assign(result, { kill: () => false }) as any;
    },
  };
  return {
    adapter: createShellBuildRunner({ proc }),
    primeOk: (command, logLines) => responses.set(command, { logLines }),
    primeFailure: (command, error) => responses.set(command, { error }),
    recordedRuns: () => runs,
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryBuildRunnerState = { byCommand: new Map() };
  return {
    adapter: createInMemoryBuildRunner(state),
    primeOk: (command, logLines) => state.byCommand?.set(command, { logLines }),
    primeFailure: (command, error) => state.byCommand?.set(command, { error }),
    recordedRuns: () =>
      (state.invocations ?? []).map((invocation) => ({
        command: invocation.command,
        options: {
          stdio: [undefined, invocation.logStream, undefined],
          preferLocal: false,
          signal: invocation.signal,
          timeout: invocation.timeoutMs,
          env: invocation.env,
        },
      })),
  };
}

const adapters = [
  ['shell', shellSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('BuildRunner (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs the build command and resolves with the output dir', async () => {
    const { adapter, primeOk } = makeSetup();
    primeOk('npm run build:storybook --output-dir=/tmp/build');
    const result = await adapter.build({
      command: 'npm run build:storybook --output-dir=/tmp/build',
      outputDir: '/tmp/build',
    });
    expect(result).toEqual({ outputDir: '/tmp/build' });
  });

  it('forwards env, signal, and timeout to the subprocess', async () => {
    const { adapter, primeOk, recordedRuns } = makeSetup();
    primeOk('npm run build');
    const controller = new AbortController();
    await adapter.build({
      command: 'npm run build',
      outputDir: '/out',
      env: { CI: '1', NODE_ENV: 'production' },
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    const [run] = recordedRuns();
    expect(run.command).toBe('npm run build');
    expect(run.options.env).toEqual({ CI: '1', NODE_ENV: 'production' });
    expect(run.options.signal).toBe(controller.signal);
    expect(run.options.timeout).toBe(30_000);
    expect(run.options.preferLocal).toBe(false);
  });

  it('streams subprocess output through the supplied log stream', async () => {
    const { adapter, primeOk } = makeSetup();
    primeOk('npm run build', ['info: building...\n', 'info: done\n']);
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    await adapter.build({
      command: 'npm run build',
      outputDir: '/out',
      logStream: stream,
    });
    stream.end();
    expect(Buffer.concat(chunks).toString()).toBe('info: building...\ninfo: done\n');
  });

  it('rejects when the build subprocess fails', async () => {
    const { adapter, primeFailure } = makeSetup();
    primeFailure('npm run build', new Error('exit code 1'));
    await expect(adapter.build({ command: 'npm run build', outputDir: '/out' })).rejects.toThrow(
      /exit code 1/
    );
  });
});
