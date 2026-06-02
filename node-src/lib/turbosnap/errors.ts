/**
 * Error thrown when a lockfile exceeds the configured maximum size and parsing is skipped.
 */
export class LockFileSizeExceededError extends Error {
  constructor(
    public lockfilePath: string,
    public lockfileSizeBytes: number
  ) {
    super('Lock file too large to parse');
    this.name = 'LockFileSizeExceededError';
  }
}

/**
 * Error thrown when the lockfile parser fails to produce a dependency graph.
 */
export class LockFileParseFailedError extends Error {
  constructor(
    public lockfilePath: string,
    options?: { cause?: unknown }
  ) {
    super('Failed to parse dependency graph', options);
    this.name = 'LockFileParseFailedError';
  }
}

/**
 * Error thrown when checking out a baseline file via `git show` fails.
 */
export class BaselineCheckoutFailedError extends Error {
  constructor(
    public pathspec: string,
    options?: { cause?: unknown }
  ) {
    super(`Failed to check out baseline file: ${pathspec}`, options);
    this.name = 'BaselineCheckoutFailedError';
  }
}
