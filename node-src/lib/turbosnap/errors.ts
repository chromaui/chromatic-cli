import { HTTPClientError } from '../../io/httpClient';

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

/**
 * Error thrown when the baseline commit can't be resolved locally (e.g. `git diff` rejects with
 * "bad object").
 */
export class AncestorMissingError extends Error {
  constructor(
    public commit: string,
    options?: { cause?: unknown }
  ) {
    super(`Baseline commit not resolvable locally: ${commit}`, options);
    this.name = 'AncestorMissingError';
  }
}

/**
 * Error thrown when the baseline build was a local build with uncommitted changes.
 */
export class BaselineDirtyError extends Error {
  constructor(
    public commit: string,
    options?: { cause?: unknown }
  ) {
    super(`Baseline build had uncommitted changes: ${commit}`, options);
    this.name = 'BaselineDirtyError';
  }
}

/**
 * Error thrown when looking up a replacement ancestor build fails for an unknown reason.
 */
export class ReplacementFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Replacement build lookup failed', options);
    this.name = 'ReplacementFailedError';
  }
}

/**
 * Error thrown when a network/transport failure occurred during a network call.
 */
export class NetworkError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Network error', options);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when a `git` subprocess fails for an unknown reason.
 */
export class GitCommandError extends Error {
  constructor(
    public command: string,
    options?: { cause?: unknown }
  ) {
    super(`Git command failed: ${command}`, options);
    this.name = 'GitCommandError';
  }
}

const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

/**
 * Determine whether an unknown thrown value represents a transport-layer network failure.
 * Recognizes `HTTPClientError`, `FetchError`-shaped errors, and Node-style errors carrying a
 * known DNS/connection error code (`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`,
 * `EAI_AGAIN`) either directly or on `err.cause`.
 *
 * @param err The thrown value to inspect.
 *
 * @returns True if the value looks like a network/transport failure.
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (err instanceof HTTPClientError) {
    return true;
  }
  if ('name' in err && err.name === 'FetchError') {
    return true;
  }

  const errorCode = readCode(err) ?? readCode('cause' in err ? err.cause : undefined);
  return typeof errorCode === 'string' && NETWORK_ERROR_CODES.has(errorCode);
}

function readCode(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return 'code' in value ? value.code : undefined;
}
