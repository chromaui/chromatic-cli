import semver from 'semver';

import { isE2EBuild } from '../../lib/e2eUtils';
import { Logger } from '../../lib/log';
import type { Flags, Options } from '../../types';

export type E2EFramework = 'playwright' | 'cypress' | 'vitest';

export interface ComposeBuildArgumentsInput {
  storybook?: { version?: string };
  git: { changedFiles?: string[] };
  sourceDir: string;
  hasUserCommand: boolean;
  log: Logger;
}

/**
 * Pure: derive the flag arguments to append to whichever underlying build
 * command we end up running. Exposed so unit tests can pin storybook-version
 * gating, stats-flag selection, and the `--output-dir` toggle without having
 * to spin up a package manager or E2E resolver.
 *
 * @param input The decision inputs.
 *
 * @returns The list of CLI args (possibly empty) to append to the build
 * command. Side effects are limited to a single advisory `log.warn` when the
 * caller asked for `--only-changed` against an unsupported Storybook version.
 */
export function composeBuildArguments(input: ComposeBuildArgumentsInput): string[] {
  const { storybook, git, sourceDir, hasUserCommand, log } = input;
  const args: string[] = [];

  if (!hasUserCommand) {
    args.push(`--output-dir=${sourceDir}`);
  }

  if (git.changedFiles) {
    if (isStatsFlagSupported(storybook?.version)) {
      args.push(`${getStatsFlag(storybook?.version)}=${sourceDir}`);
    } else {
      log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
    }
  }
  return args;
}

function isStatsFlagSupported(version: string | undefined): boolean {
  if (!version) return true;
  return semver.gte(semver.coerce(version) || '0.0.0', '6.2.0');
}

// Storybook 8.0.0 deprecated --webpack-stats-json in favor of --stats-json.
// However, the angular builder did not support it until 8.5.0
function getStatsFlag(version: string | undefined): '--stats-json' | '--webpack-stats-json' {
  if (!version) return '--webpack-stats-json';
  return semver.gte(semver.coerce(version) || '0.0.0', '8.5.0')
    ? '--stats-json'
    : '--webpack-stats-json';
}

/**
 * Pick the E2E framework flag the user enabled.
 *
 * @param options The resolved options bag.
 *
 * @returns The matching framework identifier (`cypress` is the legacy default).
 */
export function resolveE2EFramework(
  options: Pick<Options, 'playwright' | 'cypress' | 'vitest'>
): E2EFramework {
  if (options.playwright) return 'playwright';
  if (options.vitest) return 'vitest';
  return 'cypress';
}

export interface AssembleBuildCommandInput {
  options: Options;
  flags?: Pick<Flags, 'buildCommand'>;
  storybook?: { version?: string };
  git: { changedFiles?: string[] };
  sourceDir: string;
  isReactNativeApp?: boolean;
  log: Logger;
  resolvers: AssembleBuildCommandResolvers;
}

export interface AssembleBuildCommandResolvers {
  /** Defer to the active package manager (npm/yarn/pnpm/bun) for `run X args…`. */
  runScript: (args: string[]) => Promise<string>;
  /** Resolve the E2E build binary invocation for the given framework. */
  runE2EBin: (framework: E2EFramework, args: string[]) => Promise<string>;
}

/**
 * Decide the full build command line. Returns `undefined` for React Native
 * apps (where no build command runs). Throws if no build command can be
 * derived (no user command, no E2E flag, no buildScriptName).
 *
 * @param input Resolved options/flags/state plus the port-backed resolvers.
 *
 * @returns The fully-resolved build command string, or `undefined` for the
 * React Native skip case.
 */
export async function assembleBuildCommand(
  input: AssembleBuildCommandInput
): Promise<string | undefined> {
  // We don't currently support building React Native Storybook so we'll skip this for now
  if (input.isReactNativeApp) return undefined;

  const userCommand = input.flags?.buildCommand || input.options.buildCommand;
  const args = composeBuildArguments({
    storybook: input.storybook,
    git: input.git,
    sourceDir: input.sourceDir,
    hasUserCommand: !!userCommand,
    log: input.log,
  });

  if (userCommand) {
    return `${userCommand} ${args.join(' ')}`;
  }

  if (isE2EBuild(input.options)) {
    return input.resolvers.runE2EBin(resolveE2EFramework(input.options), args);
  }

  if (!input.options.buildScriptName) {
    throw new Error('Unable to determine build script');
  }

  return input.resolvers.runScript([input.options.buildScriptName, ...args]);
}
