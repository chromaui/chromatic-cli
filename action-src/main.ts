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
      return {
        slug: event.payload.repository.full_name,
        branch: event.ref.replace('refs/heads/', ''),
        sha: event.sha,
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
  interactionTestFailuresCount: number;
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
    // Keep this in sync with the configured outputs in action.yml
    code: ctx.exitCode,
    url: ctx.build?.webUrl,
    buildUrl: ctx.build?.webUrl,
    storybookUrl: ctx.build?.cachedUrl?.replace(/iframe\.html.*$/, ''),
    specCount: ctx.build?.specCount,
    componentCount: ctx.build?.componentCount,
    testCount: ctx.build?.testCount,
    changeCount: ctx.build?.changeCount,
    errorCount: ctx.build?.errorCount,
    interactionTestFailuresCount: ctx.build?.interactionTestFailuresCount,
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
    const allowConsoleErrors = getInput('allowConsoleErrors');
    const autoAcceptChanges = getInput('autoAcceptChanges');
    const branchName = getInput('branchName');
    const buildScriptName = getInput('buildScriptName');
    const debug = getInput('debug');
    const diagnostics = getInput('diagnostics');
    const dryRun = getInput('dryRun');
    const exitOnceUploaded = getInput('exitOnceUploaded');
    const exitZeroOnChanges = getInput('exitZeroOnChanges');
    const externals = getInput('externals');
    const forceRebuild = getInput('forceRebuild');
    const ignoreLastBuildOnBranch = getInput('ignoreLastBuildOnBranch');
    const only = getInput('only');
    const onlyChanged = getInput('onlyChanged');
    const onlyStoryFiles = getInput('onlyStoryFiles');
    const onlyStoryNames = getInput('onlyStoryNames');
    const preserveMissing = getInput('preserveMissing');
    const projectToken = getInput('projectToken') || getInput('appCode'); // backwards compatibility
    const repositorySlug = getInput('repositorySlug');
    const skip = getInput('skip');
    const storybookBaseDir = getInput('storybookBaseDir');
    const storybookBuildDir = getInput('storybookBuildDir');
    const storybookConfigDir = getInput('storybookConfigDir');
    const traceChanged = getInput('traceChanged');
    const untraced = getInput('untraced');
    const workingDir = getInput('workingDir') || getInput('workingDirectory');
    const zip = getInput('zip');

    process.env.CHROMATIC_ACTION = 'true';
    process.env.CHROMATIC_SHA = sha;
    process.env.CHROMATIC_BRANCH = branchName || branch;
    process.env.CHROMATIC_SLUG = repositorySlug || slug;
    if (mergeCommit) {
      process.env.CHROMATIC_PULL_REQUEST_SHA = mergeCommit;
    }

    process.chdir(path.join(process.cwd(), workingDir || ''));

    const output = await runChromatic({
      allowConsoleErrors: maybe(allowConsoleErrors, false),
      autoAcceptChanges: maybe(autoAcceptChanges),
      branchName: maybe(branchName),
      buildScriptName: maybe(buildScriptName),
      debug: maybe(debug),
      diagnostics: maybe(diagnostics),
      dryRun: maybe(dryRun),
      exitOnceUploaded: maybe(exitOnceUploaded, false),
      exitZeroOnChanges: maybe(exitZeroOnChanges, true),
      externals: maybe(externals),
      forceRebuild: maybe(forceRebuild),
      fromCI: true,
      ignoreLastBuildOnBranch: maybe(ignoreLastBuildOnBranch),
      interactive: false,
      only: maybe(only),
      onlyChanged: maybe(onlyChanged),
      onlyStoryFiles: maybe(onlyStoryFiles),
      onlyStoryNames: maybe(onlyStoryNames),
      preserveMissing: maybe(preserveMissing),
      projectToken,
      repositorySlug: maybe(repositorySlug),
      skip: maybe(skip),
      storybookBaseDir: maybe(storybookBaseDir),
      storybookBuildDir: maybe(storybookBuildDir),
      storybookConfigDir: maybe(storybookConfigDir),
      traceChanged: maybe(traceChanged),
      untraced: maybe(untraced),
      workingDir: maybe(workingDir),
      zip: maybe(zip, false),
    });

    Object.entries(output).forEach(([key, value]) => setOutput(key, String(value)));

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
