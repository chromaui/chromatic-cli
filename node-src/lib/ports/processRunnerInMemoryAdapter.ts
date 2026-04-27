import { ProcessHandle, ProcessResult, ProcessRunner, ProcessRunnerOptions } from './processRunner';

/** Pre-canned response for a command pattern. */
export interface InMemoryProcessResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** When set, the run rejects with this error instead of resolving. */
  error?: Error;
}

/** Fixture state backing the in-memory {@link ProcessRunner} adapter. */
export interface InMemoryProcessRunnerState {
  /** Command string → response. The first command argument is the executable. */
  responses: Map<string, InMemoryProcessResponse>;
  /** Commands that have been run, in order. Useful for assertions. */
  runs?: { command: string; options?: ProcessRunnerOptions }[];
}

function settle(response: InMemoryProcessResponse | undefined): Promise<ProcessResult> {
  if (response?.error) return Promise.reject(response.error);
  const stdout = response?.stdout ?? '';
  return Promise.resolve<ProcessResult>({
    stdout,
    stderr: response?.stderr ?? '',
    all: stdout,
    exitCode: response?.exitCode ?? 0,
  });
}

/**
 * Construct an in-memory {@link ProcessRunner} backed by a Map of command
 * strings to responses. The state is held by reference so tests can mutate it
 * between calls.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A ProcessRunner that records runs and reads responses from the state.
 */
export function createInMemoryProcessRunner(state: InMemoryProcessRunnerState): ProcessRunner {
  return {
    run(command: string, options?: ProcessRunnerOptions): ProcessHandle {
      state.runs = [...(state.runs ?? []), { command, options }];
      const handle = settle(state.responses.get(command)) as ProcessHandle;
      handle.kill = () => false;
      return handle;
    },
  };
}
