import Listr from 'listr';

import { Context } from '../types';
import auth from './auth';
import build from './build';
import gitInfo from './gitInfo';
import initialize from './initialize';
import prepareWorkspace from './prepareWorkspace';
import report from './report';
import restoreWorkspace from './restoreWorkspace';
import snapshot from './snapshot';
import storybookInfo from './storybookInfo';
import upload from './upload';
import verify from './verify';

export const runUploadBuild = [
  auth,
  gitInfo,
  storybookInfo,
  initialize,
  build,
  upload,
  verify,
  snapshot,
];

export const runPatchBuild = [prepareWorkspace, ...runUploadBuild, restoreWorkspace];

/**
 * Prepare the list of tasks to run for a new build.
 *
 * @param options The context options set when executing the CLI.
 *
 * @returns The list of tasks to be completed.
 */
export default function index(options: Context['options']): Listr.ListrTask<Context>[] {
  const tasks = options.patchHeadRef && options.patchBaseRef ? runUploadBuild : runUploadBuild;

  return options.junitReport ? [...tasks, report] : tasks;
}
