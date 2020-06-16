import auth from './auth';
import build from './build';
import gitInfo from './gitInfo';
import prepareWorkspace from './prepareWorkspace';
import report from './report';
import restoreWorkspace from './restoreWorkspace';
import snapshot from './snapshot';
import start from './start';
import storybookInfo from './storybookInfo';
import tunnel from './tunnel';
import upload from './upload';
import verify from './verify';

export const runUploadBuild = [auth, gitInfo, storybookInfo, build, upload, verify, snapshot];
export const runTunnelBuild = [auth, gitInfo, storybookInfo, start, tunnel, verify, snapshot];
export const runPatchBuild = runBuild => [prepareWorkspace, ...runBuild, restoreWorkspace];

export default options => {
  const runBuild = options.useTunnel ? runTunnelBuild : runUploadBuild;
  const tasks = options.patchHeadRef && options.patchBaseRef ? runPatchBuild(runBuild) : runBuild;
  return options.junitReport ? tasks.concat(report) : tasks;
};
