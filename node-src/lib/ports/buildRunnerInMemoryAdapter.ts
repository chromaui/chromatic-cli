import { BuildRunner, BuildRunnerInput } from './buildRunner';

/** Pre-canned response shape for an in-memory {@link BuildRunner}. */
export interface InMemoryBuildResponse {
  /** When set, the build rejects with this error instead of resolving. */
  error?: Error;
  /** Strings written to the input log stream before the build resolves. */
  logLines?: string[];
}

/** Fixture state backing the in-memory {@link BuildRunner} adapter. */
export interface InMemoryBuildRunnerState {
  /** Default response used when no per-command entry matches. */
  default?: InMemoryBuildResponse;
  /** Command-specific responses. */
  byCommand?: Map<string, InMemoryBuildResponse>;
  /** Records each invocation in order for assertions. */
  invocations?: BuildRunnerInput[];
}

/**
 * Construct an in-memory {@link BuildRunner} backed by canned responses.
 * Records every invocation and optionally writes synthetic log lines to the
 * caller-provided log stream so phase tests can assert on the wiring.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A BuildRunner that records invocations and reads canned responses.
 */
export function createInMemoryBuildRunner(state: InMemoryBuildRunnerState): BuildRunner {
  return {
    async build(input) {
      state.invocations = [...(state.invocations ?? []), input];
      const response = state.byCommand?.get(input.command) ?? state.default;
      if (response?.logLines && input.logStream) {
        for (const line of response.logLines) input.logStream.write(line);
      }
      if (response?.error) throw response.error;
      return { outputDir: input.outputDir };
    },
  };
}
