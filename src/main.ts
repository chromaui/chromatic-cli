import * as core from '@actions/core';

async function run() {
  try {
    const appCode = core.getInput('appCode');
    const buildScriptName = core.getInput('buildScriptName');
    const scriptName = core.getInput('scriptName');
    const exec = core.getInput('exec');
    const doNotStart = core.getInput('doNotStart');
    const storybookPort = core.getInput('storybookPort');
    const storybookUrl = core.getInput('storybookUrl');
    const storybookBuildDir = core.getInput('storybookBuildDir');
    const storybookHttps = core.getInput('storybookHttps');
    const storybookCert = core.getInput('storybookCert');
    const storybookKey = core.getInput('storybookKey');
    const storybookCa = core.getInput('storybookCa');
  
    core.debug((new Date()).toTimeString())

    core.setOutput('time', JSON.stringify({
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
    core.setFailed(error.message);
  }
}

run();
