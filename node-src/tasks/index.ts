import Listr from 'listr';

import { Context } from '../types';
import report from './report';
import uploadShare from './uploadShare';

export const runShare = [uploadShare];

/**
 * Prepare the list of tasks to run for a new build.
 *
 * `auth` through `snapshot`, and the patch-build workspace prep/restore, all run directly via
 * `render*` calls in `runBuild` (`node-src/index.ts`) now; the only task that may still remain in
 * this Listr block is the conditionally-appended `report` task.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The list of tasks to be completed.
 */
export default function index(ctx: Context): Listr.ListrTask<Context>[] {
  const tasks = ctx.options.junitReport ? [report] : [];

  return tasks.map((task) => task(ctx));
}
