/** Options accepted by {@link ProcessRunner.run}. */
export interface ProcessRunnerOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Aborts the subprocess; rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Time budget in milliseconds before the subprocess is killed. */
  timeout?: number;
  /** Stdio configuration matching child_process.spawn semantics. */
  stdio?: any;
  /** When true, prefer locally-installed binaries (node_modules/.bin). */
  preferLocal?: boolean;
}

/** Settled result returned by {@link ProcessRunner.run}. */
export interface ProcessResult {
  stdout: string;
  stderr: string;
  /** Combined stdout/stderr output, when available. */
  all?: string;
  exitCode: number;
}

/**
 * Pending subprocess. Awaiting yields a {@link ProcessResult}; the handle also
 * exposes the live stdio streams and a tree-killing `kill` for callers that
 * need to interact with the running process.
 */
export interface ProcessHandle extends Promise<ProcessResult> {
  stdout?: import('stream').Readable;
  stderr?: import('stream').Readable;
  kill(): boolean;
}

/**
 * Semantic boundary over non-git subprocess execution. Production callers use
 * the execa adapter; tests use the in-memory fake.
 */
export interface ProcessRunner {
  /**
   * Run a shell command. The command string is parsed using shell-like
   * argument splitting; quote arguments that contain spaces.
   */
  run(command: string, options?: ProcessRunnerOptions): ProcessHandle;
}
