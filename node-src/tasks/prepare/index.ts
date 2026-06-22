import { createTask, transitionTo } from '../../lib/tasks';
import { Context } from '../../types';
import { initial, success, validating } from '../../ui/tasks/prepare';
import { calculateFileHashes } from './calculateFileHashes';
import { traceChangedFiles } from './traceChangedFiles';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

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
      async (ctx: Context) => {
        const { fileInfo, sourceDir } = await validateFiles(
          { log: ctx.log, options: ctx.options, packageJson: ctx.packageJson },
          {
            isReactNativeApp: !!ctx.isReactNativeApp,
            sourceDir: ctx.sourceDir,
            buildLogFile: ctx.buildLogFile,
            browsers: ctx.announcedBuild?.browsers,
          }
        );
        ctx.fileInfo = fileInfo;
        ctx.sourceDir = sourceDir;
      },
      async (ctx: Context) => {
        await validateAndroidArtifact({
          sourceDir: ctx.sourceDir,
          browsers: ctx.announcedBuild?.browsers,
        });
      },
      traceChangedFiles,
      calculateFileHashes,
      transitionTo(success, true),
    ],
  });
}
