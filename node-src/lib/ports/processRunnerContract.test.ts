import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProcessRunner } from './processRunner';
import { createExecaProcessRunner } from './processRunnerExecaAdapter';
import {
  createInMemoryProcessRunner,
  InMemoryProcessRunnerState,
} from './processRunnerInMemoryAdapter';

const execaResponses = new Map<string, { stdout?: string; error?: Error }>();

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn((cmd: string, args: string[] = []) => {
      const key = [cmd, ...args].join(' ').trim();
      const entry = execaResponses.get(key);
      if (entry?.error) return Promise.reject(entry.error);
      return Promise.resolve({
        stdout: entry?.stdout ?? '',
        stderr: '',
        all: entry?.stdout ?? '',
        exitCode: 0,
      });
    }),
  };
});

interface AdapterSetup {
  adapter: ProcessRunner;
  primeOk: (command: string, stdout: string) => void;
  primeFailure: (command: string, error: Error) => void;
}

function execaSetup(): AdapterSetup {
  return {
    adapter: createExecaProcessRunner(),
    primeOk: (command, stdout) => execaResponses.set(command, { stdout }),
    primeFailure: (command, error) => execaResponses.set(command, { error }),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryProcessRunnerState = { responses: new Map() };
  const adapter = createInMemoryProcessRunner(state);
  return {
    adapter,
    primeOk: (command, stdout) => state.responses.set(command, { stdout }),
    primeFailure: (command, error) => state.responses.set(command, { error }),
  };
}

const adapters = [
  ['execa', execaSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('ProcessRunner (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
    execaResponses.clear();
  });

  it('runs a command and resolves with stdout', async () => {
    const { adapter, primeOk } = makeSetup();
    primeOk('echo hello', 'hello');
    const result = await adapter.run('echo hello');
    expect(result.stdout).toBe('hello');
    expect(result.exitCode).toBe(0);
  });

  it('rejects when the command fails', async () => {
    const { adapter, primeFailure } = makeSetup();
    primeFailure('false', new Error('Command failed'));
    await expect(adapter.run('false')).rejects.toThrow(/Command failed/);
  });
});
