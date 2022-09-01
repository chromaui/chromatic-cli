import { error, getInput, setFailed, setOutput, info } from '@actions/core';
import { context } from '@actions/github';
import { readFile } from 'jsonfile';
import pkgUp from 'pkg-up';
import { v4 as uuid } from 'uuid';
import path from 'path';

import getEnv from '../bin-src/lib/getEnv';
import { createLogger } from '../bin-src/lib/log';
import parseArgs from '../bin-src/lib/parseArgs';
import { runAll } from '../bin-src/main';

const maybe = (a: string, b: any = undefined) => {
  if (!a) {
    return b;
  }

  try {
    return JSON.parse(a);
  } catch (e) {
    return a;
  }
};

const getBuildInfo = (event: typeof context) => {
  switch (event.eventName) {
    case 'pull_request':
    case 'pull_request_review':
    case 'pull_request_target': {
      const { head } = event.payload.pull_request;
      return {
        sha: head.sha,
        branch: head.ref,
        slug: head.repo.full_name,
        mergeCommit: event.sha,
      };
    }
    case 'push': {
      const { after, ref, repository } = event.payload;
      return {
        sha: after,
        branch: ref.replace('refs/heads/', ''),
        slug: repository.full_name,
      };
    }
    case 'workflow_run': {
      const { repository } = event.payload;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { head_sha, head_branch } = event.payload.workflow_run;

      return {
        sha: head_sha,
        branch: head_branch.replace('refs/heads/', ''),
        slug: repository.full_name,
      };
    }
    case 'workflow_dispatch': {
      const { ref, sha } = event.payload.inputs || {};

      if (!ref || !sha) {
        setFailed(
          `When triggering via workflow_dispatch, ref & sha are required inputs. See https://github.com/chromaui/action#triggering-from-workflow_dispatch`
        );
        return null;
      }

      return {
        slug: event.payload.repository.full_name,
        branch: ref.replace('refs/heads/', ''),
        ref,
        sha,
      };
    }
    default: {
      setFailed(`${event.eventName} event is not supported in this action`);
      return null;
    }
  }
};

interface Output {
  code: number;
  url: string;
  buildUrl: string;
  storybookUrl: string;
  specCount: number;
  componentCount: number;
  testCount: number;
  changeCount: number;
  errorCount: number;
  actualTestCount: number;
  actualCaptureCount: number;
  inheritedCaptureCount: number;
}

async function runChromatic(options): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);
  const packagePath = await pkgUp(); // the user's own package.json
  const packageJson = await readFile(packagePath);

  const ctx = {
    ...parseArgs([]),
    packagePath,
    packageJson,
    env,
    log,
    sessionId,
    flags: options,
  } as any;
  await runAll(ctx);

  return {
    code: ctx.exitCode,
    url: ctx.build?.webUrl,
    buildUrl: ctx.build?.webUrl,
    storybookUrl: ctx.build?.cachedUrl?.replace(/iframe\.html.*$/, ''),
    specCount: ctx.build?.specCount,
    componentCount: ctx.build?.componentCount,
    testCount: ctx.build?.testCount,
    changeCount: ctx.build?.changeCount,
    errorCount: ctx.build?.errorCount,
    actualTestCount: ctx.build?.actualTestCount,
    actualCaptureCount: ctx.build?.actualCaptureCount,
    inheritedCaptureCount: ctx.build?.inheritedCaptureCount,
  };
}

async function run() {
  const { sha, branch, slug, mergeCommit } = getBuildInfo(context) || {};
  if (!sha || !branch || !slug) return;

  try {
    // Remember to keep this list in sync with ../action.yml
    const projectToken = getInput('projectToken') || getInput('appCode'); // backwards compatibility
    const workingDir = getInput('workingDir') || getInput('workingDirectory');
    const buildScriptName = getInput('buildScriptName');
    const scriptName = getInput('scriptName');
    const exec = getInput('exec');
    const skip = getInput('skip');
    const dryRun = getInput('dryRun');
    const forceRebuild = getInput('forceRebuild');
    const storybookBaseDir = getInput('storybookBaseDir');
    const storybookConfigDir = getInput('storybookConfigDir');
    const only = getInput('only');
    const onlyChanged = getInput('onlyChanged');
    const externals = getInput('externals');
    const untraced = getInput('untraced');
    const traceChanged = getInput('traceChanged');
    const doNotStart = getInput('doNotStart');
    const diagnostics = getInput('diagnostics');
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
    const zip = getInput('zip');

    process.env.CHROMATIC_SHA = sha;
    process.env.CHROMATIC_BRANCH = branch;
    process.env.CHROMATIC_SLUG = slug;
    if (mergeCommit) {
      process.env.CHROMATIC_PULL_REQUEST_SHA = mergeCommit;
    }

    process.chdir(path.join(process.cwd(), workingDir || ''));

    const output = await runChromatic({
      projectToken,
      workingDir: maybe(workingDir),
      buildScriptName: maybe(buildScriptName),
      scriptName: maybe(scriptName),
      diagnostics: maybe(diagnostics),
      exec: maybe(exec),
      skip: maybe(skip),
      dryRun: maybe(dryRun),
      forceRebuild: maybe(forceRebuild),
      only: maybe(only),
      onlyChanged: maybe(onlyChanged),
      externals: maybe(externals),
      untraced: maybe(untraced),
      storybookBaseDir: maybe(storybookBaseDir),
      storybookConfigDir: maybe(storybookConfigDir),
      traceChanged: maybe(traceChanged),
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
      zip: maybe(zip, false),
    });

    setOutput('url', output.url);
    setOutput('buildUrl', output.buildUrl);
    setOutput('storybookUrl', output.storybookUrl);
    setOutput('code', output.code.toString());

    if (output.code !== 0) {
      setFailed('non-zero exit code');
    }

    process.exit(output.code);
  } catch (e) {
    if (e.message) error(e.message);
    if (e.stack) error(e.stack);
    if (e.description) error(e.description);

    setFailed(e.message);
    process.exit(1);
  }
}
run().catch((e) => {
  error(e);
  setFailed(e.message);
});
