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
