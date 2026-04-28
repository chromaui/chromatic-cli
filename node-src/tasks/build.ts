import path from 'path';

import { generateManifest } from '../lib/react-native/generateManifest';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { BuildPhaseError, runBuildPhase } from '../run/phases/build';
import { Context } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import missingStorybookBuildDirectory from '../ui/messages/errors/missingStorybookBuildDirectory';
import {
  failed,
  initial,
  missingBuildDirectoryForReactNative,
  pending,
  skipped,
  skippedForReactNative,
  success,
} from '../ui/tasks/build';

export const runBuild = async (ctx: Context) => {
  if (ctx.skip) return;
  try {
    const artifacts = await runBuildPhase({
      options: ctx.options,
      flags: ctx.flags,
      env: ctx.env,
      storybook: ctx.storybook,
      git: ctx.git,
      packageJson: ctx.packageJson,
      pkg: ctx.pkg,
      isReactNativeApp: ctx.isReactNativeApp,
      sourceDir: ctx.sourceDir,
      log: ctx.log,
      ports: ctx.ports,
      signal: ctx.options.experimental_abortSignal,
    });
    // Compatibility copy: downstream phases still read these via `ctx.*`.
    ctx.sourceDir = artifacts.sourceDir;
    if (artifacts.buildCommand !== undefined) ctx.buildCommand = artifacts.buildCommand;
    if (artifacts.buildLogFile !== undefined) ctx.buildLogFile = artifacts.buildLogFile;
  } catch (error) {
    if (error instanceof BuildPhaseError) {
      setExitCode(ctx, error.exitCode, error.userError);
      throw new Error(failed(ctx).output);
    }
    throw error;
  }
};

export const generateManifestForReactNative = async (ctx: Context) => {
  // The manifest file is only needed for React Native builds
  if (!ctx.isReactNativeApp) return;
  ctx.log.debug('Generating manifest.json file for React Native build');
  return await generateManifest(ctx);
};

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
        if (!ctx.options.storybookBuildDir) {
          ctx.log.error(missingStorybookBuildDirectory(ctx.announcedBuild?.browsers));
          setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
          throw new Error(missingBuildDirectoryForReactNative(ctx).output);
        }

        ctx.sourceDir = ctx.options.storybookBuildDir;
        ctx.options.outputDir = ctx.options.storybookBuildDir;

        // Use manifest.json from the storybook build directory if it exists
        if (
          await ctx.ports.fs.exists(path.resolve(ctx.options.storybookBuildDir, 'manifest.json'))
        ) {
          return skippedForReactNative(ctx).output;
        }
        return false;
      }
      if (ctx.options.storybookBuildDir) {
        ctx.sourceDir = ctx.options.storybookBuildDir;
        return skipped(ctx).output;
      }
      return false;
    },
    steps: [
      transitionTo(pending),
      startActivity,
      runBuild,
      generateManifestForReactNative,
      endActivity,
      transitionTo(success, true),
    ],
  });
}
