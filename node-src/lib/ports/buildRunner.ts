import type { Writable } from 'stream';

/** Input to {@link BuildRunner.build}. */
export interface BuildRunnerInput {
  /**
   * Resolved Storybook build command (already includes flags, output dir, stats
   * flag, and any package-manager prefix). The domain assembles the string;
   * the runner only invokes it.
   */
  command: string;
  /** Directory the build is expected to write into. Surfaced back on the result. */
  outputDir: string;
  /** Environment variables passed through to the subprocess. */
  env?: Record<string, string | undefined>;
  /** Optional writable stream the subprocess's combined output is forwarded to. */
  logStream?: Writable;
  /** AbortSignal that cancels the build. */
  signal?: AbortSignal;
  /** Hard timeout in milliseconds. */
  timeoutMs?: number;
}

/** Result of {@link BuildRunner.build}. */
export interface BuildRunnerResult {
  /** Echoes the input outputDir for convenience. */
  outputDir: string;
}

/**
 * Boundary over the Storybook build subprocess. The domain decides *what* to
 * build (command string, output directory, environment); this port handles
 * how* to invoke it (subprocess lifecycle, log streaming, abort, timeout).
 */
export interface BuildRunner {
  /** Run the build and resolve once it exits successfully; rejects on non-zero exit, abort, or timeout. */
  build(input: BuildRunnerInput): Promise<BuildRunnerResult>;
}
