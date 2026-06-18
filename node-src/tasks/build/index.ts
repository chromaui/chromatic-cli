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
          // Mid-run reports are inert in the legacy phase (buildDeps supplies a no-op `report`);
          // runTask wires the real renderer-aware reporter once the build task swaps onto it.
          const deps = { options: ctx.options, log: ctx.log, report: () => {} };
          transitionTo(pending)(ctx, task);
          await startActivity(ctx, task);
          // if the user has not provided build artifacts, we need to build them ourselves
          if (!ctx.options.storybookBuildDir) {
            const artifacts = await buildArtifacts(deps, {
              sourceDir: ctx.sourceDir,
              browsers: ctx.announcedBuild?.browsers,
              runtimeMetadata: ctx.runtimeMetadata,
            });
            ctx.reactNativeBuildLogFile = artifacts.reactNativeBuildLogFile;
          }
          transitionTo(pendingManifest)(ctx, task);
          await generateManifestStep(deps, { sourceDir: ctx.sourceDir });
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
          const builtStorybook = await buildStorybook(
            {
              options: ctx.options,
              log: ctx.log,
              env: ctx.env,
              analytics: ctx.analytics,
              pkg: ctx.pkg,
            },
            {
              buildCommand: ctx.buildCommand,
              runtimeMetadata: ctx.runtimeMetadata,
              storybook: ctx.storybook,
              git: ctx.git,
            }
          );
          ctx.buildLogFile = builtStorybook.buildLogFile;
          endActivity(ctx);
          transitionTo(success, true)(ctx, task);
        }
      },
    ],
  });
}
