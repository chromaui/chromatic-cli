import { getInput, debug, setFailed, setOutput } from '@actions/core';
import {GitHub, context} from "@actions/github";


async function run() {
  try {
    
    const token = getInput('token');
    const github = new GitHub(token);

    const appCode = getInput('appCode');
    const buildScriptName = getInput('buildScriptName');
    const scriptName = getInput('scriptName');
    const exec = getInput('exec');
    const doNotStart = getInput('doNotStart');
    const storybookPort = getInput('storybookPort');
    const storybookUrl = getInput('storybookUrl');
    const storybookBuildDir = getInput('storybookBuildDir');
    const storybookHttps = getInput('storybookHttps');
    const storybookCert = getInput('storybookCert');
    const storybookKey = getInput('storybookKey');
    const storybookCa = getInput('storybookCa');
  
    debug((new Date()).toTimeString())

    const { data: { id }} = await github.repos.createDeployment({
      ...context.repo,
      ref: context.sha,
      environment: 'staging',
    });

    
    github.repos.createDeploymentStatus({
      ...context.repo,
      deployment_id: id,
      state: "inactive"
    });

    
    // const newIssue = await github.issues.create({
    //   ...context.repo,
    //   title: 'New issue!',
    //   body: 'Hello Universe!'
    // });

    // log.info(newIssue)

    setOutput('time', JSON.stringify({
      appCode,
      buildScriptName,
      scriptName,
      exec,
      doNotStart,
      storybookPort,
      storybookUrl,
      storybookBuildDir,
      storybookHttps,
      storybookCert,
      storybookKey,
      storybookCa,
    }));
  } catch (error) {
    setFailed(error.message);
  }
}

run();
