/** Result of {@link PackageManager.detect}. */
export interface PackageManagerInfo {
  /** Package-manager name as reported by `@antfu/ni` (`'npm' | 'yarn' | 'pnpm' | 'bun'`). */
  name: string;
  /** Package-manager version (e.g. `'8.19.2'`). */
  version: string;
}

/** Optional flags for {@link PackageManager.exec}. */
export interface PackageManagerExecOptions {
  /** Working directory the subprocess runs in. */
  cwd?: string;
}

/**
 * Boundary over the user's package manager (npm/pnpm/yarn/bun). The domain
 * decides what to ask of the package manager (a script name, a CLI argument,
 * a registry lookup); this port handles which manager to invoke and how to
 * spawn it.
 *
 * Production callers use the adapter that wraps `@antfu/ni` and `yarn-or-npm`;
 * tests use the in-memory fake to skip subprocess spawning.
 */
export interface PackageManager {
  /** Detect the active package manager and resolve its version. */
  detect(): Promise<PackageManagerInfo>;
  /** Build a "package-manager run" command string for the given args, e.g. `npm run build`. */
  getRunCommand(args: string[]): Promise<string>;
  /** Spawn the package manager with the given args; resolves with trimmed stdout. */
  exec(args: string[], options?: PackageManagerExecOptions): Promise<string>;
  /** Whether a `yarn.lock` is present in the project root. Drives a couple of UI message variants. */
  hasYarn(): boolean;
}
