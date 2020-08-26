import { getInput, error, setFailed, setOutput } from '@actions/core';
import { context } from "@actions/github";
import { v4 as uuid } from 'uuid';

import { runAll } from 'chromatic/bin/main';
import parseArgs from 'chromatic/bin/lib/parseArgs';
import {createLogger} from 'chromatic/bin/lib/log';
import getEnv from 'chromatic/bin/lib/getEnv';

const maybe = (a: string, b: any = undefined) => {
  if(!a) {
    return b;
  }

  try {
    return JSON.parse(a);
  } catch(e){
    return a;
  }
}

const getCommit = (event: typeof context) => {
  switch (event.eventName) {
    case 'pull_request': {
      return {
        // @ts-ignore
        owner: event.payload.repository.owner.login, 
        // @ts-ignore
        repo: event.payload.repository.name,
        // @ts-ignore
        branch: event.payload.pull_request.head.ref,
        // @ts-ignore
        ref: event.ref || event.payload.pull_request.head.ref,
        // @ts-ignore
        sha: event.payload.pull_request.head.sha,
      };
    }
    case 'push': {
      return {
        // @ts-ignore
        owner: event.payload.repository.owner.login, 
        // @ts-ignore
        repo: event.payload.repository.name,
        branch: event.payload.ref.replace('refs/heads/', ''),
        ref: event.payload.ref,
        sha: event.payload.after,
      };
    }
    default: {
      setFailed(event.eventName + ' event is not supported in this action');

      return null;
    };
  }
}

interface Output {
  url: string;
  code: number;
}

async function runChromatic(options): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);

  const context = {...parseArgs([]), env, log, sessionId, flags: options} as any
  
  await runAll(context);  
  const { build, exitCode } = context; 

  const { webUrl } = build || {};

  return {
    url: webUrl,
    code: exitCode,
  };
}

async function run() {
  const commit = getCommit(context);
  
  if (!commit){
    return;
  }

  const { branch, sha } = commit;

  try {
    const projectToken = getInput('projectToken') || getInput('appCode'); // backwards compatibility
    const buildScriptName = getInput('buildScriptName');
    const scriptName = getInput('scriptName');
    const exec = getInput('exec');
    const skip = getInput('skip');
    const doNotStart = getInput('doNotStart');
    const storybookPort = getInput('storybookPort');
    const storybookUrl = getInput('storybookUrl');
    const storybookBuildDir = getInput('storybookBuildDir');
    const storybookHttps = getInput('storybookHttps');
    const storybookCert = getInput('storybookCert');
    const storybookKey = getInput('storybookKey');
    const storybookCa = getInput('storybookCa');
    const preserveMissing = getInput('preserveMissing');
    const autoAcceptChanges = getInput('autoAcceptChanges');
    const allowConsoleErrors = getInput('allowConsoleErrors');
    const exitZeroOnChanges = getInput('exitZeroOnChanges');
    const exitOnceUploaded = getInput('exitOnceUploaded');
    const ignoreLastBuildOnBranch = getInput('ignoreLastBuildOnBranch');

    process.env.CHROMATIC_SHA = sha;
    process.env.CHROMATIC_BRANCH = branch;

    const chromatic = runChromatic({
      projectToken,
      buildScriptName: maybe(buildScriptName),
      scriptName: maybe(scriptName),
      exec: maybe(exec),
      skip: maybe(skip),
      doNotStart: maybe(doNotStart),
      storybookPort: maybe(storybookPort),
      storybookUrl: maybe(storybookUrl),
      storybookBuildDir: maybe(storybookBuildDir),
      storybookHttps: maybe(storybookHttps),
      storybookCert: maybe(storybookCert),
      storybookKey: maybe(storybookKey),
      storybookCa: maybe(storybookCa),
      fromCI: true,
      interactive: false,
      preserveMissing: maybe(preserveMissing),
      autoAcceptChanges: maybe(autoAcceptChanges),
      exitZeroOnChanges: maybe(exitZeroOnChanges, true),
      exitOnceUploaded: maybe(exitOnceUploaded, false),
      allowConsoleErrors: maybe(allowConsoleErrors, false),
      ignoreLastBuildOnBranch: maybe(ignoreLastBuildOnBranch),
    });

    const [{ url, code }] = await Promise.all([
      chromatic,
    ]);

    setOutput('url', url);
    setOutput('code', code.toString());

    if(code !== 0){
      setFailed('non-zero exit code');
    }
  } catch (e) {
    e.message && error(e.message);
    e.stack && error(e.stack);
    e.description && error(e.description);

    setFailed(e.message);
  }
}
run();
