import nodePath from 'node:path';

import { AnalyticsEvent } from '@cli/analytics/events';
import semver from 'semver';

import { sanitizeStackTrace } from '../../lib/analytics/sanitization';
import { buildBinName as e2eBuildBinName, getE2EBuildCommand } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { emailHash } from '../../lib/emailHash';
import type { Environment } from '../../lib/getEnvironment';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { exitCodes } from '../../lib/setExitCode';
import type { Context, Flags, Options } from '../../types';
import buildFailed from '../../ui/messages/errors/buildFailed';
import e2eBuildFailed from '../../ui/messages/errors/e2eBuildFailed';
import missingDependency from '../../ui/messages/errors/missingDependency';
import type { BuildArtifactsState, GitState } from '../types';
import { assembleBuildCommand, resolveE2EFramework } from './buildCommand';

/**
 * Error thrown by {@link runBuildPhase} on a known failure mode. Carries the
 * exit code (and userError flag) the orchestrator should set on the way out.
 */
export class BuildPhaseError extends Error {
  readonly exitCode: number;
  readonly userError: boolean;
  constructor(message: string, exitCode: number, userError = true) {
    super(message);
    this.name = 'BuildPhaseError';
    this.exitCode = exitCode;
    this.userError = userError;
  }
}

export type BuildPhasePorts = Pick<
  Ports,
  'fs' | 'builder' | 'pkgMgr' | 'analytics' | 'errors' | 'host'
>;

export interface BuildPhaseInput {
  options: Options;
  flags?: Pick<Flags, 'buildCommand'>;
  env: Pick<Environment, 'STORYBOOK_BUILD_TIMEOUT' | 'STORYBOOK_NODE_ENV'>;
  storybook?: { version?: string };
  git: Pick<GitState, 'changedFiles' | 'gitUserEmail' | 'ciService'>;
  packageJson: Context['packageJson'];
  pkg: { version: string };
  isReactNativeApp?: boolean;
  /** Optional pre-set source dir (e.g. when --storybook-build-dir is passed). */
  sourceDir?: string;
  log: Logger;
  ports: BuildPhasePorts;
  signal?: AbortSignal;
}

/**
 * Pure orchestration of the `build` phase. Resolves an output directory,
 * assembles the build command, runs it via `ports.builder`, and emits failure
 * analytics. Returns the typed artifacts slice on success; throws
 * {@link BuildPhaseError} on a known failure (E2E missing dep, build failed,
 * abort) so the wrapping orchestrator can set the appropriate exit code.
 *
 * @param input Phase inputs.
 *
 * @returns The {@link BuildArtifactsState} produced by the build.
 */
export async function runBuildPhase(input: BuildPhaseInput): Promise<BuildArtifactsState> {
  if (input.isReactNativeApp) {
    if (!input.sourceDir) {
      throw new BuildPhaseError(
        'React Native build requires a pre-built source directory',
        exitCodes.INVALID_OPTIONS
      );
    }
    return { sourceDir: input.sourceDir };
  }

  const sourceDirectory = input.sourceDir ?? (await resolveSourceDirectory(input));
  const buildCommand = await assembleBuildCommand({
    options: input.options,
    flags: input.flags,
    storybook: input.storybook,
    git: input.git,
    sourceDir: sourceDirectory,
    isReactNativeApp: false,
    log: input.log,
    resolvers: {
      runScript: (args) => input.ports.pkgMgr.getRunCommand(args),
      runE2EBin: async (framework, args) => {
        const resolved = await getE2EBuildCommand(makeLegacyE2EContext(input), framework, args);
        if (!resolved) throw new Error('Unable to resolve E2E build command');
        return resolved;
      },
    },
  });

  const artifacts: BuildArtifactsState = { sourceDir: sourceDirectory, buildCommand };
  const logFile = await openBuildLog(input);
  if (logFile) artifacts.buildLogFile = logFile.path;

  try {
    input.log.debug('Running build command:', buildCommand);
    if (!buildCommand) throw new Error('No build command configured');
    await input.ports.builder.build({
      command: buildCommand,
      outputDir: sourceDirectory,
      logStream: logFile?.stream,
      signal: input.signal,
      timeoutMs: input.env.STORYBOOK_BUILD_TIMEOUT,
      env: {
        CI: '1',
        NODE_ENV: input.env.STORYBOOK_NODE_ENV || 'production',
        STORYBOOK_INVOKED_BY: 'chromatic',
      },
    });
  } catch (error) {
    await handleBuildFailure(
      { ...input, buildCommand, buildLogFile: artifacts.buildLogFile },
      error
    );
  } finally {
    logFile?.stream.end();
  }
  return artifacts;
}

async function resolveSourceDirectory(input: BuildPhaseInput): Promise<string> {
  if (input.options.outputDir) return input.options.outputDir;
  if (input.storybook?.version && semver.lt(input.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    return 'storybook-static';
  }
  const temporaryDirectory = await input.ports.fs.mkdtemp({
    unsafeCleanup: true,
    prefix: `chromatic-`,
  });
  return temporaryDirectory.path;
}

interface OpenedLogFile {
  path: string;
  stream: import('stream').Writable;
}

async function openBuildLog(input: BuildPhaseInput): Promise<OpenedLogFile | undefined> {
  const requested = input.options.storybookLogFile;
  if (!requested) return undefined;
  const filePath = nodePath.resolve(requested);
  const stream = input.ports.fs.createWriteStream(filePath);
  await new Promise<void>((resolve, reject) => {
    stream.on('open', () => resolve());
    stream.on('error', reject);
  });
  return { path: filePath, stream };
}

interface BuildFailureContext extends BuildPhaseInput {
  buildCommand?: string;
  buildLogFile?: string;
}

async function handleBuildFailure(input: BuildFailureContext, error: unknown): Promise<never> {
  const error_ = error as Error & { message: string };
  if (isE2EBuild(input.options)) {
    // If we tried to run the E2E package's bin directly (due to being in the action)
    // and it failed, that means we couldn't find it. This probably means they haven't
    // installed the right dependency or run from the right directory
    const errorInfo = e2eBuildErrorMessage(error_, input.ports.host.cwd(), input.options);
    const errorCategory =
      errorInfo.exitCode === exitCodes.MISSING_DEPENDENCY
        ? 'e2e_missing_dependency'
        : 'e2e_build_failed';
    trackBuildFailure(input, errorCategory, error_);
    input.log.error(errorInfo.message);
    throw new BuildPhaseError(errorInfo.message, errorInfo.exitCode);
  }

  if (input.signal?.aborted) {
    trackBuildFailure(input, 'aborted', error_);
    input.signal.throwIfAborted();
  }

  trackBuildFailure(input, 'storybook_build_failed', error_);
  const buildLog = input.buildLogFile
    ? await input.ports.fs.readFile(input.buildLogFile, 'utf8').catch(() => undefined)
    : undefined;
  const message = buildFailed(makeLegacyMessageContext(input), error_, buildLog);
  input.log.error(message);
  throw new BuildPhaseError(message, exitCodes.NPM_BUILD_STORYBOOK_FAILED);
}

function isE2EBuildCommandNotFoundError(errorMessage: string) {
  // It's hard to know if this is the case as each package manager has a different type of
  // error for this, but we'll try to figure it out.
  const ERROR_PATTERNS = [
    // `Command not found: build-archive-storybook`
    'command not found',
    // `Command "build-archive-storybook" not found`
    `[\\W]?${e2eBuildBinName}[\\W]? not found`,
    // npm not found error can include this code
    'code E404',
    // Exit code 127 is a generic not found exit code
    'exit code 127',
    // A single line error from execa like `Command failed: yarn build-archive-storybook ...`
    `command failed.*${e2eBuildBinName}.*$`,
  ];
  // eslint-disable-next-line security/detect-non-literal-regexp
  return ERROR_PATTERNS.some((pattern) => new RegExp(pattern, 'gi').test(errorMessage));
}

function e2eBuildErrorMessage(
  error: Error,
  workingDirectory: string,
  options: Options
): { exitCode: number; message: string } {
  const flag = resolveE2EFramework(options);
  // If we tried to run the E2E package's bin directly (due to being in the action)
  // and it failed, that means we couldn't find it. This probably means they haven't
  // installed the right dependency or run from the right directory.
  if (isE2EBuildCommandNotFoundError(error.message)) {
    const dependencyName = `@chromatic-com/${flag}`;
    return {
      exitCode: exitCodes.MISSING_DEPENDENCY,
      message: missingDependency({ dependencyName, flag, workingDir: workingDirectory }),
    };
  }
  return {
    exitCode: exitCodes.E2E_BUILD_FAILED,
    message: e2eBuildFailed({ flag, errorMessage: error.message }),
  };
}

function trackBuildFailure(input: BuildFailureContext, errorCategory: string, error: Error) {
  try {
    input.ports.analytics.track(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {
      errorCategory,
      stackTrace: sanitizeStackTrace(error?.stack),
      buildCommand: input.buildCommand,
      source: 'cli',
      cliVersion: input.pkg?.version,
      storybookVersion: input.storybook?.version,
      isCI: !!input.ports.host.get('CI'),
      ciService: input.git?.ciService,
      gitUserEmailHash: input.git?.gitUserEmail ? emailHash(input.git.gitUserEmail) : undefined, // avoid hashing empty string
    });
  } catch (analyticsError) {
    // Analytics should be best-effort, never fail the build, but we want to know about it
    input.ports.errors.captureException(analyticsError);
  }
}

/**
 * Synthesize a minimal Context-shaped argument for `getE2EBuildCommand`. The
 * helper still expects a `Context` for `setExitCode` / message rendering on
 * its own MODULE_NOT_FOUND failure path; we keep it ctx-shaped here and
 * translate the resulting throw via {@link BuildPhaseError} above.
 *
 * @param input The phase input from which to project the legacy ctx.
 *
 * @returns A Context-shaped value with just the fields the helper reads.
 */
function makeLegacyE2EContext(input: BuildPhaseInput): Context {
  return {
    options: input.options,
    log: input.log,
    ports: input.ports,
    pkg: input.pkg,
  } as unknown as Context;
}

/**
 * Synthesize a Context-shaped argument for the `buildFailed` message renderer.
 *
 * @param input The phase failure context from which to project the legacy ctx.
 *
 * @returns A Context-shaped value with the fields the renderer reads.
 */
function makeLegacyMessageContext(input: BuildFailureContext): Context {
  return {
    options: input.options,
    log: input.log,
    ports: input.ports,
    pkg: input.pkg,
    storybook: input.storybook,
    isReactNativeApp: input.isReactNativeApp,
  } as unknown as Context;
}
