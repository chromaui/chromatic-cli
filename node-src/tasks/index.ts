import Listr from 'listr';

import { Context } from '../types';
import prepareWorkspace from './prepareWorkspace';
import report from './report';
import restoreWorkspace from './restoreWorkspace';
import uploadShare from './uploadShare';

export const runShare = [uploadShare];

// snapshot migrated to the Clack renderer (`renderSnapshot`, called directly in `index.ts`); only
// the conditionally-appended `report` task may remain in this Listr block.
export const runUploadBuild: ((ctx: Context) => Listr.ListrTask<Context>)[] = [];

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
