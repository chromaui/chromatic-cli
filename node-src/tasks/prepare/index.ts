import { createTask, transitionTo } from '../../lib/tasks';
import { Context, FileInfo, TaskResult } from '../../types';
import { initial, success, validating } from '../../ui/tasks/prepare';
import { calculateFileHashes, CalculateFileHashesInput } from './calculateFileHashes';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

type PrepareDeps = Pick<Context, 'log' | 'env' | 'options'>;

interface PrepareInput {
  transitionToHashing: () => void;
  invalidFileInfoError: Error;
  fileInfo?: FileInfo;
  sourceDir: string;
}

interface PrepareOutput {
  hashes?: Record<string, string>;
}

// eslint-disable-next-line jsdoc/require-jsdoc
export async function runPrepare(
  deps: PrepareDeps,
  input: PrepareInput
): Promise<TaskResult<PrepareOutput>> {
  let hashes: Record<string, string> | undefined;
  if (deps.options.fileHashing) {
    input.transitionToHashing();
    if (input.fileInfo) {
      const calculateFileHashesInput: CalculateFileHashesInput = {
        fileInfo: input.fileInfo,
        sourceDir: input.sourceDir,
      };
      try {
        hashes = await calculateFileHashes(deps, calculateFileHashesInput);
      } catch (err) {
        deps.log.warn('Failed to calculate file hashes');
        deps.log.debug(err);
      }
    } else {
      deps.log.warn('Failed to calculate file hashes: no file info available.');
      deps.log.debug(input.invalidFileInfoError);
    }
  }
  return { kind: 'continue', output: { hashes } };
}

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
