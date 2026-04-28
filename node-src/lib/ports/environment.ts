/**
 * Boundary over the host environment — `process.env`, `process.cwd()`,
 * `process.platform`, `process.versions.node`, and CI-service detection. The
 * domain reads through this port so that tests can swap in deterministic
 * values without monkey-patching `process`.
 */
export interface Environment {
  /** Read an env-var by name. Returns `undefined` if unset. */
  get(key: string): string | undefined;
  /** Snapshot the full environment as a plain object. Useful for telemetry. */
  all(): Record<string, string | undefined>;
  /** Current working directory, as `process.cwd()` returns. */
  cwd(): string;
  /** Node platform, e.g. `'darwin' | 'linux' | 'win32'`. */
  platform(): NodeJS.Platform;
  /** Node version string, e.g. `'18.18.0'`. */
  nodeVersion(): string;
  /** Detected CI service (or `undefined` when not running in CI). */
  ci(): string | undefined;
}
