import nodePath from 'node:path';

import AdmZip from 'adm-zip';
import semver from 'semver';
import slash from 'slash';

import type { Environment } from '../../lib/getEnvironment';
import { getFileHashes } from '../../lib/getFileHashes';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { rewriteErrorMessage } from '../../lib/utilities';
import type { Context, Options, TurboSnap } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import deviatingOutputDirectory from '../../ui/messages/warnings/deviatingOutputDirectory';
import { invalid, invalidAndroidArtifact, invalidReactNative } from '../../ui/tasks/prepare';
import type {
  BuildArtifactsState,
  GitState,
  PreparedFileInfo,
  PreparedState,
  TurboSnapState,
} from '../types';

// Special characters that need to be escaped in filenames because they are
// used as special characters in picomatch.
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;

/**
 * Discriminated outcome of running the prepare phase. Most failure modes are
 * surfaced via {@link PreparePhaseError} rather than this enum because they
 * carry an associated error message; the outcome is what the wrapping Listr
 * task uses to drive UI transitions on the success path.
 */
export type PrepareOutcome =
  | { kind: 'prepared' }
  | { kind: 'turbosnap-traced'; affectedStoryFiles: number }
  | { kind: 'turbosnap-bailed' };

/**
 * Error thrown by {@link runPreparePhase} on a known failure mode. Carries the
 * (optional) updated TurboSnap state so the wrapper can mirror `bailReason`
 * onto `ctx.turboSnap` before surfacing the error to Listr.
 */
export class PreparePhaseError extends Error {
  readonly turboSnap?: TurboSnap;
  readonly category:
    | 'invalid-storybook'
    | 'invalid-android-artifact'
    | 'missing-stats-file'
    | 'tracer-error';
  constructor(
    message: string,
    options: {
      category:
        | 'invalid-storybook'
        | 'invalid-android-artifact'
        | 'missing-stats-file'
        | 'tracer-error';
      turboSnap?: TurboSnap;
    }
  ) {
    super(message);
    this.name = 'PreparePhaseError';
    this.category = options.category;
    this.turboSnap = options.turboSnap;
  }
}

export type PreparePhasePorts = Pick<Ports, 'fs' | 'tracer' | 'clock'>;

export interface PreparePhaseInput {
  options: Options;
  env: Pick<Environment, 'CHROMATIC_HASH_CONCURRENCY'>;
  storybook?: Context['storybook'];
  isReactNativeApp?: boolean;
  /** Browsers attached to the announced build (drives RN validator). */
  browsers?: string[];
  /** Build artifacts produced by the build phase. */
  artifacts: BuildArtifactsState;
  /**
   * Git slice produced by the gitInfo phase. Forwarded in full to the legacy
   * turbosnap tracer, which still expects `rootPath`, `changedFiles`,
   * `packageMetadataChanges`, etc. on a Context-shaped argument.
   */
  git: GitState;
  /**
   * TurboSnap state inherited from the gitInfo phase (set when `--only-changed`
   * is in effect for this branch). Undefined disables turbosnap tracing.
   */
  turboSnap?: TurboSnap;
  /** Used by the `deviatingOutputDirectory` warning to render its hint. */
  packageJson?: Context['packageJson'];
  log: Logger;
  ports: PreparePhasePorts;
}

export interface PreparePhaseOutput extends PreparedState, Pick<TurboSnapState, 'turboSnap'> {
  outcome: PrepareOutcome;
}

/**
 * Pure orchestration of the `prepare` phase. Validates the build directory,
 * enumerates files, optionally narrows to TurboSnap-affected stories, and
 * (optionally) hashes the file list. Returns the typed slice on success;
 * throws {@link PreparePhaseError} when validation or tracing fails.
 *
 * @param input Phase inputs.
 *
 * @returns The accumulated {@link PreparedState} plus turbosnap state and a
 * discriminated outcome describing the path taken.
 */
export async function runPreparePhase(input: PreparePhaseInput): Promise<PreparePhaseOutput> {
  const { sourceDir, fileInfo } = await validate(input);
  await validateAndroidArtifact({ ...input, sourceDir });
  const traced = await trace({ ...input, sourceDir, fileInfo });
  const hashedFileInfo = await hashIfRequested({ ...input, sourceDir, fileInfo: traced.fileInfo });

  return {
    sourceDir,
    fileInfo: hashedFileInfo,
    onlyStoryFiles: traced.onlyStoryFiles,
    untracedFiles: traced.untracedFiles,
    turboSnap: traced.turboSnap,
    outcome: traced.outcome,
  };
}

interface ValidatedDirectory {
  sourceDir: string;
  fileInfo: PreparedFileInfo;
}

async function validate(input: PreparePhaseInput): Promise<ValidatedDirectory> {
  const validator = input.isReactNativeApp ? isValidReactNativeStorybook : isValidStorybook;
  let sourceDirectory = input.artifacts.sourceDir;
  let fileInfo = await getFileInfo(input, sourceDirectory);

  if (!validator(fileInfo, input.browsers).valid && input.artifacts.buildLogFile) {
    try {
      const buildLog = await input.ports.fs.readFile(input.artifacts.buildLogFile, 'utf8');
      const outputDirectory = getOutputDirectory(buildLog);
      if (outputDirectory && outputDirectory !== sourceDirectory) {
        input.log.warn(
          deviatingOutputDirectory(
            makeLegacyMessageContext(input, sourceDirectory),
            outputDirectory
          )
        );
        sourceDirectory = outputDirectory;
        fileInfo = await getFileInfo(input, sourceDirectory);
      }
    } catch (error) {
      input.log.debug(error);
    }
  }

  const result = validator(fileInfo, input.browsers);
  if (!result.valid) {
    const message = input.isReactNativeApp
      ? invalidReactNative(makeLegacyMessageContext(input, sourceDirectory), result.missingFiles)
          .output
      : invalid(makeLegacyMessageContext(input, sourceDirectory)).output;
    throw new PreparePhaseError(message, { category: 'invalid-storybook' });
  }
  return { sourceDir: sourceDirectory, fileInfo };
}

async function validateAndroidArtifact(
  input: PreparePhaseInput & { sourceDir: string }
): Promise<void> {
  if (!input.browsers?.includes('android')) return;

  const apkPath = nodePath.join(input.sourceDir, 'storybook.apk');
  const apkBuffer = await input.ports.fs.readFile(apkPath);
  const zip = new AdmZip(apkBuffer);
  const entries = zip.getEntries();

  const abiDirectories = new Set<string>();
  for (const entry of entries) {
    const match = entry.entryName.match(/^lib\/([^/]+)\//);
    if (match) abiDirectories.add(match[1]);
  }

  if (abiDirectories.size > 0 && !abiDirectories.has('x86_64')) {
    throw new PreparePhaseError(
      invalidAndroidArtifact(makeLegacyMessageContext(input, input.sourceDir)).output,
      { category: 'invalid-android-artifact' }
    );
  }
}

interface TraceResult {
  fileInfo: PreparedFileInfo;
  onlyStoryFiles?: string[];
  untracedFiles?: string[];
  turboSnap?: TurboSnap;
  outcome: PrepareOutcome;
}

// eslint-disable-next-line complexity
async function trace(input: PreparePhaseInput & ValidatedDirectory): Promise<TraceResult> {
  const turboSnap = input.turboSnap;
  if (!turboSnap || turboSnap.unavailable) {
    return { fileInfo: input.fileInfo, turboSnap, outcome: { kind: 'prepared' } };
  }
  if (!input.git.changedFiles) {
    return { fileInfo: input.fileInfo, turboSnap, outcome: { kind: 'prepared' } };
  }
  if (!input.fileInfo.statsPath) {
    const nonLegacyStatsSupported =
      input.storybook?.version &&
      semver.gte(semver.coerce(input.storybook.version) || '0.0.0', '8.0.0');
    const updatedTurboSnap: TurboSnap = { ...turboSnap, bailReason: { missingStatsFile: true } };
    throw new PreparePhaseError(missingStatsFile({ legacy: !nonLegacyStatsSupported }), {
      category: 'missing-stats-file',
      turboSnap: updatedTurboSnap,
    });
  }

  const tracerContext = makeLegacyTracerContext(input);

  try {
    const onlyStoryFiles = await input.ports.tracer.traceChangedFiles(tracerContext);
    const updatedTurboSnap = (tracerContext.turboSnap ?? turboSnap) as TurboSnap;
    const untracedFiles = tracerContext.untracedFiles;
    if (!onlyStoryFiles) {
      return {
        fileInfo: input.fileInfo,
        untracedFiles,
        turboSnap: updatedTurboSnap,
        outcome: { kind: 'turbosnap-bailed' },
      };
    }

    const escapedKeys = Object.keys(onlyStoryFiles).map((key) =>
      key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
    );

    if (!input.options.interactive) {
      if (!input.options.traceChanged) {
        input.log.info(
          `Found affected story files:\n${Object.entries(onlyStoryFiles)
            .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
            .join('\n')}`
        );
      }
      if (untracedFiles && untracedFiles.length > 0) {
        input.log.info(
          `Encountered ${untracedFiles.length} untraced files:\n${untracedFiles
            .map((f) => `  ${f}`)
            .join('\n')}`
        );
      }
    }

    return {
      fileInfo: input.fileInfo,
      onlyStoryFiles: escapedKeys,
      untracedFiles,
      turboSnap: updatedTurboSnap,
      outcome: { kind: 'turbosnap-traced', affectedStoryFiles: escapedKeys.length },
    };
  } catch (error) {
    const error_ = error as Error;
    if (!input.options.interactive) {
      input.log.info('Failed to retrieve dependent story files', {
        statsPath: input.fileInfo.statsPath,
        changedFiles: input.git.changedFiles,
        err: error_,
      });
    }
    const updatedTurboSnap = (tracerContext.turboSnap ?? turboSnap) as TurboSnap;
    const rewritten = rewriteErrorMessage(
      error_,
      `Could not retrieve dependent story files.\n${error_.message}`
    );
    throw new PreparePhaseError(rewritten.message, {
      category: 'tracer-error',
      turboSnap: updatedTurboSnap,
    });
  }
}

async function hashIfRequested(
  input: PreparePhaseInput & ValidatedDirectory
): Promise<PreparedFileInfo> {
  if (!input.options.fileHashing) return input.fileInfo;
  try {
    const start = input.ports.clock.now();
    const hashes = await getFileHashes(
      input.fileInfo.paths,
      input.sourceDir,
      input.env.CHROMATIC_HASH_CONCURRENCY
    );
    input.log.debug(`Calculated file hashes in ${input.ports.clock.since(start)}ms`);
    return { ...input.fileInfo, hashes };
  } catch (error) {
    input.log.warn('Failed to calculate file hashes');
    input.log.debug(error);
    return input.fileInfo;
  }
}

interface PathSpec {
  pathname: string;
  contentLength: number;
}

async function getPathSpecsInDirectory(
  input: PreparePhaseInput,
  rootDirectory: string,
  dirname = '.'
): Promise<PathSpec[]> {
  // .chromatic is reserved for internal use and should not be uploaded.
  if (dirname === '.chromatic') {
    return [];
  }

  try {
    const entries = await input.ports.fs.readDir(nodePath.join(rootDirectory, dirname));
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const pathname = nodePath.join(dirname, entry);
        const stats = await input.ports.fs.stat(nodePath.join(rootDirectory, pathname));
        return stats.isDirectory()
          ? getPathSpecsInDirectory(input, rootDirectory, pathname)
          : [{ pathname, contentLength: stats.size }];
      })
    );
    return nested.flat();
  } catch (error) {
    input.log.debug(error);
    throw new PreparePhaseError(
      invalid(makeLegacyMessageContext(input, rootDirectory), error as Error).output,
      { category: 'invalid-storybook' }
    );
  }
}

async function getFileInfo(
  input: PreparePhaseInput,
  sourceDirectory: string
): Promise<PreparedFileInfo> {
  const pathSpecs = await getPathSpecsInDirectory(input, sourceDirectory);
  const lengths = pathSpecs.map((entry) => ({ ...entry, knownAs: slash(entry.pathname) }));
  const total = lengths.reduce((sum, { contentLength }) => sum + contentLength, 0);
  const paths: string[] = [];
  let statsPath = '';
  for (const { knownAs } of lengths) {
    if (knownAs.endsWith('preview-stats.json')) statsPath = nodePath.join(sourceDirectory, knownAs);
    else if (!knownAs.endsWith('manager-stats.json')) paths.push(knownAs);
  }
  return { lengths, paths, statsPath, total };
}

function getOutputDirectory(buildLog: string): string | undefined {
  const outputString = 'Output directory: ';
  const outputIndex = buildLog.lastIndexOf(outputString);
  if (outputIndex === -1) return undefined;
  const remainingLog = buildLog.slice(outputIndex + outputString.length);
  const newlineIndex = remainingLog.indexOf('\n');
  const outputDirectory = newlineIndex === -1 ? remainingLog : remainingLog.slice(0, newlineIndex);
  return outputDirectory.trim();
}

function isValidStorybook({ paths, total }: PreparedFileInfo): {
  valid: boolean;
  missingFiles: string[];
} {
  const missingFiles = ['iframe.html', 'index.html'].filter((file) => !paths.includes(file));
  return { valid: total > 0 && missingFiles.length === 0, missingFiles };
}

function isValidReactNativeStorybook(
  { paths, total }: PreparedFileInfo,
  browsers: string[] = []
): { valid: boolean; missingFiles: string[] } {
  const hasAndroid = browsers.includes('android');
  const hasIOS = browsers.includes('ios');
  const missingFiles: string[] = [];

  if (!hasAndroid && !hasIOS) {
    return { valid: false, missingFiles };
  }
  if (!paths.includes('manifest.json')) {
    missingFiles.push('manifest.json');
  }
  // Ensure we have a storybook.apk file on Android builds.
  if (hasAndroid && !paths.includes('storybook.apk')) {
    missingFiles.push('storybook.apk');
  }
  // Ensure we have a storybook.app directory on iOS builds.
  if (hasIOS && !paths.some((path) => path.startsWith('storybook.app/'))) {
    missingFiles.push('storybook.app');
  }
  return { valid: total > 0 && missingFiles.length === 0, missingFiles };
}

/**
 * Synthesize a Context-shaped argument for the legacy `invalid` /
 * `invalidReactNative` / `deviatingOutputDirectory` message renderers. They
 * still expect a Context for a few field reads; we stub only what they touch.
 *
 * @param input The phase input from which to project the legacy ctx.
 * @param sourceDirectory The (possibly re-resolved) source directory.
 *
 * @returns A Context-shaped value with the fields the renderers read.
 */
function makeLegacyMessageContext(input: PreparePhaseInput, sourceDirectory: string): Context {
  return {
    options: input.options,
    log: input.log,
    packageJson: input.packageJson,
    sourceDir: sourceDirectory,
    buildLogFile: input.artifacts.buildLogFile,
    isReactNativeApp: input.isReactNativeApp,
    announcedBuild: input.browsers ? { browsers: input.browsers } : undefined,
  } as unknown as Context;
}

/**
 * Synthesize a Context-shaped argument for `ports.tracer.traceChangedFiles`.
 * The current tracer adapter mutates `turboSnap.bailReason`, `untracedFiles`,
 * and `git.changedDependencyNames` on the supplied object; the phase reads
 * those mutations off the synthesized context after the call.
 *
 * @param input The phase input from which to project the tracer ctx.
 *
 * @returns A Context-shaped value carrying the slice fields the tracer reads.
 */
function makeLegacyTracerContext(input: PreparePhaseInput & ValidatedDirectory): Context {
  return {
    log: input.log,
    options: input.options,
    storybook: input.storybook,
    ports: input.ports,
    fileInfo: input.fileInfo,
    git: { ...input.git },
    turboSnap: input.turboSnap ? { ...input.turboSnap } : undefined,
    sourceDir: input.sourceDir,
    isReactNativeApp: input.isReactNativeApp,
    packageJson: input.packageJson,
  } as unknown as Context;
}
