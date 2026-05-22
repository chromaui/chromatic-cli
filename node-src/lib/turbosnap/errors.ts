/** Thrown when a lockfile exceeds the configured maximum size and parsing is skipped. */
export class LockFileSizeExceededError extends Error {
  constructor(
    public lockfilePath: string,
    public lockfileSizeBytes: number
  ) {
    super('Lock file too large to parse');
    this.name = 'LockFileSizeExceededError';
  }
}

/** Thrown when the lockfile parser fails to produce a dependency graph. */
export class LockFileParseFailedError extends Error {
  constructor(
    public lockfilePath: string,
    options?: { cause?: unknown }
  ) {
    super('Failed to parse dependency graph');
    this.name = 'LockFileParseFailedError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
