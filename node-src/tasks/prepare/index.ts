import { createTask, transitionTo } from '@cli/tasks';
import * as turbosnap from '@cli/turbosnap';
import type Listr from 'listr';
import semver from 'semver';

import { rewriteErrorMessage } from '../../lib/utilities';
import { AnnouncedBuild, Context, FileInfo, TaskResult, TurboSnap } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import {
  bailed,
  hashing,
  initial,
  invalid,
  invalidAndroidArtifact,
  invalidReactNative,
  success,
  traced,
  tracing,
  validating,
} from '../../ui/tasks/prepare';
import { calculateFileHashes, CalculateFileHashesInput } from './calculateFileHashes';
import {
  traceChangedFiles,
  TraceChangedFilesInput,
} from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import {
  isValidReactNativeStorybook,
  isValidStorybook,
  validateFiles,
  ValidateFilesInput,
} from './validateFiles';


} from '../../ui/tasks/prepare';
} from './validateFiles';

type PrepareDeps = Pick<Context, 'log' | 'env' | 'options' | 'packageJson'>;

type PrepareTraceInput = TraceChangedFilesInput & {
  turboSnap: TurboSnap | undefined;
  changedFiles: string[] | undefined;
  missingStatsError: () => Error;
};

interface PrepareInput {
  sourceDir: string;
  validateFilesInput: ValidateFilesInput;
  invalidAndroidArtifactError: Error;
  traceChangedFilesInput: Omit<PrepareTraceInput, 'statsPath'>;
  transitionToHashing: () => void;
}

interface PrepareOutput {
  hashes?: Record<string, string>;
  onlyStoryFiles?: string[];
}

// eslint-disable-next-line jsdoc/require-jsdoc, complexity
export async function runPrepare(
  deps: PrepareDeps,
  input: PrepareInput
): Promise<TaskResult<PrepareOutput>> {
  const fileInfo = await validateFiles(deps, input.validateFilesInput);

  if (input.validateFilesInput.browsers.includes('android')) {
    const isValidAndroidArtifact = await validateAndroidArtifact(input.sourceDir);
    if (!isValidAndroidArtifact) {
      throw input.invalidAndroidArtifactError;
    }
  }

  const traceInput = input.traceChangedFilesInput;
  let onlyStoryFiles: string[] | undefined;
  if (traceInput.turboSnap && !traceInput.turboSnap.unavailable && traceInput.changedFiles) {
    if (!fileInfo.statsPath) {
      throw traceInput.missingStatsError();
    }
    try {
      onlyStoryFiles = await traceChangedFiles(deps, {
        ...traceInput,
        statsPath: fileInfo.statsPath,
      });
    } catch (err) {
      if (!deps.options.interactive) {
        deps.log.info('Failed to retrieve dependent story files', {
          statsPath: fileInfo.statsPath,
          changedFiles: traceInput.changedFiles,
          err,
        });
      }
      throw rewriteErrorMessage(err, `Could not retrieve dependent story files.\n${err.message}`);
    }
  }

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
  return {
    kind: 'continue',
    output: { hashes, onlyStoryFiles },
  };
}

export const extractPrepareInput = (
  ctx: Context,
  listrTask: Listr.ListrTaskWrapper<Context>
): PrepareInput => {
  // eslint-disable-next-line unicorn/prevent-abbreviations
  const sourceDir = ctx.sourceDir;
  const validateFilesInput: ValidateFilesInput = {
    browsers: ctx.announcedBuild?.browsers || [],
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

  const traceChangedFilesInput: Omit<PrepareTraceInput, 'statsPath'> = {
    turboSnap: ctx.turboSnap,
    changedFiles: ctx.git.changedFiles,
    untracedFiles: ctx.untracedFiles,
    missingStatsError(): Error {
      const nonLegacyStatsSupported =
        ctx.storybook?.version &&
        semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');
      if (ctx.turboSnap) ctx.turboSnap.bailReason = { missingStatsFile: true };
      return new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
    },
    transitionToTracing: () => transitionTo(tracing)(ctx, listrTask),
    transitionToTraced: () => transitionTo(traced)(ctx, listrTask),
    transitionToBailed: () => transitionTo(bailed)(ctx, listrTask),
    // TECHDEBT: due to some upcoming work around turbosnap, we don't want to refactor `turbosnap.traceChangedFiles` to remove the
    // context dependency yet, so we're passing in a closure around the original function to keep context from leaking into task bodies.
    // Future refactor work should remove the context dependency from turbosnap and refactor this implementation.
    runInnerTrace: (statsPath: FileInfo['statsPath']) =>
      turbosnap.traceChangedFiles(ctx, statsPath),
  };

  return {
    sourceDir,
    validateFilesInput,
    invalidAndroidArtifactError: new Error(invalidAndroidArtifact(ctx).output),
    traceChangedFilesInput,
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
