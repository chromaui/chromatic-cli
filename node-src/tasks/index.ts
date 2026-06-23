import Listr from 'listr';

import { Context } from '../types';
import prepareWorkspace from './prepareWorkspace';
import report from './report';
import restoreWorkspace from './restoreWorkspace';
import snapshot from './snapshot';
import upload from './upload';
import uploadShare from './uploadShare';
import verify from './verify';

export const runShare = [uploadShare];

export const runUploadBuild = [upload, verify, snapshot];

export const runPatchBuild = [prepareWorkspace, ...runUploadBuild, restoreWorkspace];

/**
 * Prepare the list of tasks to run for a new build.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The list of tasks to be completed.
 */
export default function index(ctx: Context): Listr.ListrTask<Context>[] {
  const tasks =
    ctx.options.patchHeadRef && ctx.options.patchBaseRef ? runUploadBuild : runUploadBuild;

  if (ctx.options.junitReport) {
    tasks.push(report);
  }

  return tasks.map((task) => task(ctx));
}
