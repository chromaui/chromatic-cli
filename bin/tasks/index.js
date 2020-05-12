import auth from './auth';
import build from './build';
import gitInfo from './gitInfo';
import snapshot from './snapshot';
import start from './start';
import storybookInfo from './storybookInfo';
import tunnel from './tunnel';
import upload from './upload';
import verify from './verify';
import prepareWorkspace from './prepareWorkspace';
import restoreWorkspace from './restoreWorkspace';

export const runUploadBuild = [auth, gitInfo, storybookInfo, build, upload, verify, snapshot];
export const runTunnelBuild = [auth, gitInfo, storybookInfo, start, tunnel, verify, snapshot];
export const runPatchBuild = runBuild => [prepareWorkspace, ...runBuild, restoreWorkspace];

export default options => {
  const runBuild = options.scriptName || options.exec ? runTunnelBuild : runUploadBuild;
  return options.patchHeadRef && options.patchBaseRef ? runPatchBuild(runBuild) : runBuild;
};
