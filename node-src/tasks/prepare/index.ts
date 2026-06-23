import { Context, Deps, TaskResult } from '../../types';
import { calculateFileHashes } from './calculateFileHashes';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

export interface PrepareInput {
  isReactNativeApp: boolean;
  sourceDir: string;
  buildLogFile?: string;
  browsers?: string[];
  // Context threaded for the still-ctx-coupled TurboSnap subsystem (see traceChangedFiles).
  turboSnapContext: Context;
}

export interface PrepareOutput {
  fileInfo: NonNullable<Context['fileInfo']>;
  sourceDir: string;
  onlyStoryFiles?: string[];
}

/**
 * Validate the built Storybook (or E2E/React Native) artifacts, trace which specs are affected by
 * recent changes via TurboSnap, and hash the files for deduplicated upload.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the validated file info, source directory and affected specs.
 */
export async function prepareProject(
  deps: Deps,
  input: PrepareInput
): Promise<TaskResult<PrepareOutput>> {
  const { fileInfo, sourceDir } = await validateFiles(deps, {
    isReactNativeApp: input.isReactNativeApp,
    sourceDir: input.sourceDir,
    buildLogFile: input.buildLogFile,
    browsers: input.browsers,
  });

  await validateAndroidArtifact({ sourceDir, browsers: input.browsers });

  // TurboSnap reads the freshly-validated stats file; validateFiles may have corrected the directory.
  input.turboSnapContext.fileInfo = fileInfo;
  const { onlyStoryFiles } = await traceChangedFiles(deps, {
    turboSnapContext: input.turboSnapContext,
  });

  const { hashes } = await calculateFileHashes(deps, { fileInfo, sourceDir });
  if (hashes) {
    fileInfo.hashes = hashes;
  }

  return { kind: 'continue', output: { fileInfo, sourceDir, onlyStoryFiles } };
}

export const extractPrepareInput = (ctx: Context): PrepareInput => ({
  isReactNativeApp: !!ctx.isReactNativeApp,
  sourceDir: ctx.sourceDir,
  buildLogFile: ctx.buildLogFile,
  browsers: ctx.announcedBuild?.browsers,
  turboSnapContext: ctx,
});

export const applyPrepareOutput = (ctx: Context, output: PrepareOutput) => {
  ctx.fileInfo = output.fileInfo;
  ctx.sourceDir = output.sourceDir;
  if (output.onlyStoryFiles) {
    ctx.onlyStoryFiles = output.onlyStoryFiles;
  }
};
