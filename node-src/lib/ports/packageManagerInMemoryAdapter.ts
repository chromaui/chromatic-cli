import { PackageManager, PackageManagerInfo } from './packageManager';

/** Pre-canned exec response for an in-memory {@link PackageManager}. */
export interface InMemoryExecResponse {
  /** Trimmed stdout returned to the caller. */
  stdout?: string;
  /** When set, the call rejects with this error instead of resolving. */
  error?: Error;
}

/** Fixture state backing the in-memory {@link PackageManager} adapter. */
export interface InMemoryPackageManagerState {
  /** Result of `detect()`. Defaults to `{ name: 'npm', version: '10.0.0' }`. */
  info?: PackageManagerInfo;
  /** Map of "args.join(' ')" to the response returned by `exec`. */
  execResponses?: Map<string, InMemoryExecResponse>;
  /**
   * Function used by `getRunCommand` to assemble the run-command string.
   * Defaults to `(args) => `${info.name} run ${args.join(' ')}``.
   */
  runCommand?: (args: string[]) => string;
  /** Value returned by `hasYarn()`. Defaults to `false`. */
  hasYarn?: boolean;
  /** Records each exec invocation's args + options for assertions. */
  execCalls?: { args: string[]; options?: { cwd?: string } }[];
}

/**
 * Construct an in-memory {@link PackageManager} backed by canned responses.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A PackageManager that records exec calls and reads canned responses.
 */
export function createInMemoryPackageManager(state: InMemoryPackageManagerState): PackageManager {
  return {
    async detect() {
      return state.info ?? { name: 'npm', version: '10.0.0' };
    },
    async getRunCommand(args) {
      if (state.runCommand) return state.runCommand(args);
      const name = state.info?.name ?? 'npm';
      return `${name} run ${args.join(' ')}`;
    },
    async exec(args, options) {
      state.execCalls = [...(state.execCalls ?? []), { args, options }];
      const response = state.execResponses?.get(args.join(' '));
      if (response?.error) throw response.error;
      return response?.stdout ?? '';
    },
    hasYarn() {
      return state.hasYarn ?? false;
    },
  };
}
