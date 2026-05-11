import type Listr from 'listr';

import { createTask, transitionTo } from '../../lib/tasks';
import { AnnouncedBuild, Context, FileInfo, TaskResult } from '../../types';
import {
  hashing,
  initial,
  invalid,
  invalidReactNative,
  success,
  validating,
} from '../../ui/tasks/prepare';
import { calculateFileHashes, CalculateFileHashesInput } from './calculateFileHashes';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import {
  isValidReactNativeStorybook,
  isValidStorybook,
  validateFiles,
  ValidateFilesInput,
} from './validateFiles';

type PrepareDeps = Pick<Context, 'log' | 'env' | 'options' | 'packageJson'>;

interface PrepareInput {
  sourceDir: string;
  validateFilesInput: ValidateFilesInput;
  transitionToHashing: () => void;
}

interface PrepareOutput {
  hashes?: Record<string, string>;
}

// eslint-disable-next-line jsdoc/require-jsdoc
export async function runPrepare(
  deps: PrepareDeps,
  input: PrepareInput
): Promise<TaskResult<PrepareOutput>> {
  const fileInfo = await validateFiles(deps, input.validateFilesInput);

  let hashes: Record<string, string> | undefined;
  if (deps.options.fileHashing) {
    input.transitionToHashing();
    const calculateFileHashesInput: CalculateFileHashesInput = {
      fileInfo,
      sourceDir: input.sourceDir,
    };
    try {
      hashes = await calculateFileHashes(deps, calculateFileHashesInput);
    } catch (err) {
      deps.log.warn('Failed to calculate file hashes');
      deps.log.debug(err);
    }
  }
  return { kind: 'continue', output: { hashes } };
}

export const extractPrepareInput = (
  ctx: Context,
  listrTask: Listr.ListrTaskWrapper<Context>
): PrepareInput => {
  if (!ctx.announcedBuild) {
    throw new Error('Announced build required for prepare task.');
  }
  // eslint-disable-next-line unicorn/prevent-abbreviations
  const sourceDir = ctx.sourceDir;
  const validateFilesInput: ValidateFilesInput = {
    browsers: ctx.announcedBuild.browsers,
    buildLogFile: ctx.buildLogFile,
    getFileInfoErrorBuilder(err: Error): Error {
      return new Error(invalid(ctx, err).output);
    },
    isReactNativeApp: ctx.isReactNativeApp || false,
    sourceDir,
    validationErrorBuilder(missingFiles: string[] | undefined): Error {
      return ctx.isReactNativeApp
        ? new Error(invalidReactNative(ctx, missingFiles).output)
        : new Error(invalid(ctx).output);
    },
    validator(
      fileInfo: FileInfo,
      browsers: AnnouncedBuild['browsers']
    ): { valid: boolean; missingFiles: string[] } {
      return ctx.isReactNativeApp
        ? isValidReactNativeStorybook(fileInfo, browsers)
        : isValidStorybook(fileInfo);
    },
  };

  return {
    sourceDir,
    validateFilesInput,
    transitionToHashing: () => transitionTo(hashing)(ctx, listrTask),
  };
};

/**
 * Sets up the Listr task for preparing the built storybook for upload to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'prepare',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      return !!ctx.skip;
    },
    steps: [
      transitionTo(validating),
      validateFiles,
      validateAndroidArtifact,
      traceChangedFiles,
      calculateFileHashes,
      transitionTo(success, true),
    ],
  });
}
