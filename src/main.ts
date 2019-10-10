import { getInput, info, error, setFailed, setOutput } from '@actions/core';
import { GitHub, context } from "@actions/github";
import { runTest } from 'storybook-chromatic/bin/tester/index';
import { verifyOptions } from 'storybook-chromatic/bin/lib/verify-option';

async function run() {
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

  const { data: { id }} = await github.repos.createDeployment({
    ...context.repo,
    ref: context.sha,
    environment: 'staging',
    required_contexts: [],
  });
  
  github.repos.createDeploymentStatus({
    ...context.repo,
    deployment_id: id,
    state: "in_progress",
  });

  try {
    info('options: ' + JSON.stringify({
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
      }, null, 2));
    

    const maybe = (a) => {
      if(!a) {
        return undefined;
      }

      try {
        return JSON.parse(a);
      } catch(e){
        return a;
      }
    }

    const exitCode = await runTest(verifyOptions({
      appCode,
      buildScriptName: maybe(buildScriptName),
      scriptName: maybe(scriptName),
      exec: maybe(exec),
      doNotStart: maybe(doNotStart),
      storybookPort: maybe(storybookPort),
      storybookUrl: maybe(storybookUrl),
      storybookBuildDir: maybe(storybookBuildDir),
      storybookHttps: maybe(storybookHttps),
      storybookCert: maybe(storybookCert),
      storybookKey: maybe(storybookKey),
      storybookCa: maybe(storybookCa),
    }));
    const url = 'https://example.com?real'
    const status = exitCode === 0 ? 'success' : 'failure';

    github.repos.createDeploymentStatus({
      ...context.repo,
      deployment_id: id,
      state: status,
      environment_url: url,
      log_url: 'https://example.com?log'
    });

    setOutput('url', url);
  } catch (e) {
    e.message && error(e.message);
    e.stack && error(e.stack);
    e.description && error(e.description);

    github.repos.createDeploymentStatus({
      ...context.repo,
      deployment_id: id,
      state: 'failure',
    });

    setFailed(e.message);
  }
}

run();
