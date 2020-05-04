import auth from './auth';
import build from './build';
import git from './git';
import snapshot from './snapshot';
import start from './start';
import storybook from './storybook';
import tunnel from './tunnel';
import upload from './upload';
import verify from './verify';

export const runUploadBuild = [auth, git, storybook, build, upload, verify, snapshot];
export const runTunnelBuild = [auth, git, storybook, start, tunnel, verify, snapshot];
export const runPatchBuild = [];

export default options => {
  if (options.patchBuild) return runPatchBuild;
  if (options.scriptName || options.exec) return runTunnelBuild;
  return runUploadBuild;
};
