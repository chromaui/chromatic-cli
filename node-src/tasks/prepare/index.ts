import { Context, Deps, TaskResult } from '../../types';
import { calculateFileHashes } from './calculateFileHashes';
import { traceChangedFiles, TraceChangedFilesOutput } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';
import { validateIosArtifact } from './validateIosArtifact';

export interface PrepareInput {
  isReactNativeApp: boolean;
  sourceDir: string;
  buildLogFile?: string;
  // Unset when sharing a Storybook, which announces no build.
  announcedBuild?: Pick<Context['announcedBuild'], 'id' | 'browsers'>;
  git: Context['git'];
  storybook: Context['storybook'];
  turboSnap?: Context['turboSnap'];
}

export interface PrepareOutput extends TraceChangedFilesOutput {
  fileInfo: NonNullable<Context['fileInfo']>;
  sourceDir: string;
}

/**
 * Validate the built Storybook (or E2E/React Native) artifacts, trace which specs are affected by
 * recent changes via TurboSnap, and hash the files for deduplicated upload.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the validated file info, source directory, and TurboSnap results.
 */
export async function prepareProject(
  deps: Deps,
  input: PrepareInput
): Promise<TaskResult<PrepareOutput>> {
  const browsers = input.announcedBuild?.browsers;
  const { fileInfo, sourceDir } = await validateFiles(deps, {
    isReactNativeApp: input.isReactNativeApp,
    sourceDir: input.sourceDir,
    buildLogFile: input.buildLogFile,
    browsers,
  });

  await validateAndroidArtifact({ sourceDir, browsers });
  await validateIosArtifact({ sourceDir, browsers });

  // TurboSnap reads the freshly validated paths; validateFiles may have corrected the directory.
  const traceOutput = await traceChangedFiles(deps, {
    buildId: input.announcedBuild?.id,
    git: input.git,
    storybook: input.storybook,
    turboSnap: input.turboSnap,
    sourceDir,
    statsPath: fileInfo.statsPath,
  });

  const { hashes } = await calculateFileHashes(deps, { fileInfo, sourceDir });
  if (hashes) {
    fileInfo.hashes = hashes;
  }

  return { kind: 'continue', output: { ...traceOutput, fileInfo, sourceDir } };
}

export const extractPrepareInput = (ctx: Context): PrepareInput => ({
  isReactNativeApp: !!ctx.isReactNativeApp,
  sourceDir: ctx.sourceDir,
  buildLogFile: ctx.buildLogFile,
  announcedBuild: ctx.announcedBuild,
  git: ctx.git,
  storybook: ctx.storybook,
  turboSnap: ctx.turboSnap,
});

export const applyPrepareOutput = (ctx: Context, output: PrepareOutput) => {
  ctx.fileInfo = output.fileInfo;
  ctx.sourceDir = output.sourceDir;
  ctx.turboSnapOutcome = output.turboSnapOutcome;
  if (output.turboSnap) {
    ctx.turboSnap = output.turboSnap;
  }
  if (output.onlyStoryFiles) {
    ctx.onlyStoryFiles = output.onlyStoryFiles;
  }
  if (output.untracedFiles) {
    ctx.untracedFiles = output.untracedFiles;
  }
  if (output.changedDependencyNames) {
    ctx.git.changedDependencyNames = output.changedDependencyNames;
  }
};
