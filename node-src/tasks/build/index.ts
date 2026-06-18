import { existsSync } from 'fs';
import path from 'path';

import { createTask, transitionTo } from '../../lib/tasks';
import { Context, Task } from '../../types';
import { endActivity, startActivity } from '../../ui/components/activity';
import { initial, pending, skipped, success } from '../../ui/tasks/build';
import {
  pendingManifest,
  skipped as reactNativeSkipped,
  success as reactNativeSuccess,
} from '../../ui/tasks/buildReactNative';
import { buildArtifacts, generateManifestStep } from './buildReactNative';
import { buildStorybook } from './buildStorybook';
import { setBuildCommand } from './setBuildCommand';
import { setSourceDirectory } from './setSourceDirectory';

/**
 * Sets up the Listr task for building the user's Storybook or E2E project.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'build',
    title: initial(ctx).title,
    skip: async (ctx) => {
      if (ctx.skip) return true;

      if (ctx.isReactNativeApp) {
        // react native build can be skipped if the user has provided build artifacts AND included a manifest
        if (ctx.options.storybookBuildDir) {
          ctx.sourceDir = ctx.options.storybookBuildDir;
          if (existsSync(path.resolve(ctx.options.storybookBuildDir, 'manifest.json'))) {
            return reactNativeSkipped().output;
          }
          return false;
        }
      } else {
        // web build can be skipped if the user has already built their storybook and provided the output directory
        if (ctx.options.storybookBuildDir) {
          ctx.sourceDir = ctx.options.storybookBuildDir;
          return skipped(ctx).output;
        }
      }
      return false;
    },
    steps: [
      async (ctx: Context) => {
        ctx.sourceDir = await setSourceDirectory(
          { options: ctx.options },
          { sourceDir: ctx.sourceDir, storybook: ctx.storybook }
        );
      },
      // to avoid duplicated UI, we handle both paths of the build process in one task
      async (ctx: Context, task: Task) => {
        if (ctx.isReactNativeApp) {
          transitionTo(pending)(ctx, task);
          await startActivity(ctx, task);
          // if the user has not provided build artifacts, we need to build them ourselves
          if (!ctx.options.storybookBuildDir) {
            await buildArtifacts(ctx, task);
          }
          transitionTo(pendingManifest)(ctx, task);
          await generateManifestStep(ctx);
          endActivity(ctx);
          transitionTo(reactNativeSuccess, true)(ctx, task);
        } else {
          ctx.buildCommand = await setBuildCommand(
            { options: ctx.options, log: ctx.log },
            {
              sourceDir: ctx.sourceDir,
              flags: ctx.flags,
              storybook: ctx.storybook,
              changedFiles: ctx.git.changedFiles,
            }
          );
          transitionTo(pending)(ctx, task);
          await startActivity(ctx, task);
          await buildStorybook(ctx);
          endActivity(ctx);
          transitionTo(success, true)(ctx, task);
        }
      },
    ],
  });
}
