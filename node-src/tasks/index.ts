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
import { getBranch, getCommit, getSlug } from '../git/git';

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

export default (options: Context['options']): Listr.ListrTask<Context>[] => {
  const tasks = options.patchHeadRef && options.patchBaseRef ? runUploadBuild : runUploadBuild;

  return options.junitReport ? tasks.concat(report) : tasks;
};

export type GitInfo = {
  branch: string;
  commit: string;
  slug: string;
};

export async function getGitInfo(): Promise<GitInfo> {
  const branch = await getBranch();
  const { commit } = await getCommit();
  const slug = await getSlug();

  const [ownerName, repoName, ...rest] = slug ? slug.split('/') : [];
  const isValidSlug = !!ownerName && !!repoName && !rest.length;

  return { branch, commit, slug: isValidSlug ? slug : '' };
}
