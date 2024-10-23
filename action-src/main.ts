import '../node-src/errorMonitoring';

import { error, getInput, getMultilineInput, setFailed, setOutput } from '@actions/core';
import { context } from '@actions/github';
import * as Sentry from '@sentry/node';
import path from 'path';

import { run as runNode } from '../node-src';

const maybe = (a: string | string[], b: any = undefined) => {
  if (!a) {
    return b;
  }

  if (Array.isArray(a)) {
    return a;
  }

  try {
    return JSON.parse(a);
  } catch {
    return a;
  }
};

// TODO: refactor this function
// eslint-disable-next-line complexity
const getBuildInfo = (event: typeof context) => {
  switch (event.eventName) {
    case 'pull_request':
    case 'pull_request_review':
    case 'pull_request_target': {
      const { head } = (event.payload.pull_request as any) || {};
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
        slug: repository?.full_name,
      };
    }
    case 'workflow_run': {
      const { repository } = event.payload;
      const { head_sha, head_branch } = event.payload.workflow_run;

      return {
        sha: head_sha,
        branch: head_branch.replace('refs/heads/', ''),
        slug: repository?.full_name,
      };
    }
    case 'workflow_dispatch':
    case 'issue_comment': {
      return {
        sha: event.sha,
        branch: event.ref.replace('refs/heads/', ''),
        slug: event.payload.repository?.full_name,
      };
    }
    case 'schedule':
      return {
        sha: event.sha,
        branch: event.ref.replace('refs/heads/', ''),
        slug: event.payload.repository?.full_name,
      };
    case 'release': {
      return {
        sha: event.sha,
        branch: event.payload.release.target_commitish,
        slug: event.payload.repository?.full_name,
      };
    }
    case 'merge_group': {
      const { head_sha, head_ref } = event.payload.merge_group;
      return {
        sha: head_sha,
        branch: head_ref,
        slug: event.payload.repository?.full_name,
      };
    }
    default: {
      setFailed(`${event.eventName} event is not supported in this action`);
      return;
    }
  }
};

// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
async function run() {
  const { sha, branch, slug, mergeCommit } = getBuildInfo(context) || {};
  if (!sha || !branch || !slug) return;

  try {
    // Remember to keep this list in sync with ../action.yml
    const allowConsoleErrors = getInput('allowConsoleErrors');
    const autoAcceptChanges = getInput('autoAcceptChanges');
    const branchName = getInput('branchName');
    const buildScriptName = getInput('buildScriptName');
    const buildCommand = getInput('buildCommand');
    const configFile = getInput('configFile');
    const cypress = getInput('cypress');
    const debug = getInput('debug');
    const diagnosticsFile = getInput('diagnosticsFile') || getInput('diagnostics');
    const dryRun = getInput('dryRun');
    const exitOnceUploaded = getInput('exitOnceUploaded');
    const exitZeroOnChanges = getInput('exitZeroOnChanges');
    const externals = getMultilineInput('externals');
    const fileHashing = getInput('fileHashing');
    const forceRebuild = getInput('forceRebuild');
    const ignoreLastBuildOnBranch = getInput('ignoreLastBuildOnBranch');
    const logFile = getInput('logFile');
    const logLevel = getInput('logLevel');
    const logPrefix = getInput('logPrefix');
    const only = getInput('only');
    const onlyChanged = getInput('onlyChanged');
    const onlyStoryFiles = getMultilineInput('onlyStoryFiles');
    const onlyStoryNames = getMultilineInput('onlyStoryNames');
    const playwright = getInput('playwright');
    const preserveMissing = getInput('preserveMissing');
    const projectToken = getInput('projectToken') || getInput('appCode'); // backwards compatibility
    const repositorySlug = getInput('repositorySlug');
    const skip = getInput('skip');
    const skipUpdateCheck = getInput('skipUpdateCheck');
    const storybookBaseDir = getInput('storybookBaseDir');
    const storybookBuildDir = getInput('storybookBuildDir');
    const storybookConfigDir = getInput('storybookConfigDir');
    const storybookLogFile = getInput('storybookLogFile');
    const traceChanged = getInput('traceChanged');
    const untraced = getMultilineInput('untraced');
    const uploadMetadata = getInput('uploadMetadata');
    const workingDir = getInput('workingDir') || getInput('workingDirectory');
    const zip = getInput('zip');
    const junitReport = getInput('junitReport');

    process.env.CHROMATIC_ACTION = 'true';
    process.env.CHROMATIC_SHA = sha;
    process.env.CHROMATIC_BRANCH = branchName || branch;
    process.env.CHROMATIC_SLUG = repositorySlug || slug;
    if (mergeCommit) {
      process.env.CHROMATIC_PULL_REQUEST_SHA = mergeCommit;
    }

    process.chdir(path.join(process.cwd(), workingDir || ''));

    const output = await runNode({
      options: {
        inAction: true,
      },
      flags: {
        allowConsoleErrors: maybe(allowConsoleErrors, false),
        autoAcceptChanges: maybe(autoAcceptChanges),
        branchName: maybe(branchName),
        buildScriptName: maybe(buildScriptName),
        buildCommand: maybe(buildCommand),
        configFile: maybe(configFile),
        cypress: maybe(cypress),
        debug: maybe(debug),
        diagnosticsFile: maybe(diagnosticsFile),
        dryRun: maybe(dryRun),
        exitOnceUploaded: maybe(exitOnceUploaded, false),
        exitZeroOnChanges: maybe(exitZeroOnChanges, true),
        externals: maybe(externals),
        fileHashing: maybe(fileHashing, true),
        forceRebuild: maybe(forceRebuild),
        ignoreLastBuildOnBranch: maybe(ignoreLastBuildOnBranch),
        interactive: false,
        logFile: maybe(logFile),
        logLevel: maybe(logLevel),
        logPrefix: maybe(logPrefix),
        only: maybe(only),
        onlyChanged: maybe(onlyChanged),
        onlyStoryFiles: maybe(onlyStoryFiles),
        onlyStoryNames: maybe(onlyStoryNames),
        playwright: maybe(playwright),
        preserveMissing: maybe(preserveMissing),
        projectToken,
        repositorySlug: maybe(repositorySlug),
        skip: maybe(skip),
        skipUpdateCheck: maybe(skipUpdateCheck, false),
        storybookBaseDir: maybe(storybookBaseDir),
        storybookBuildDir: maybe(storybookBuildDir),
        storybookConfigDir: maybe(storybookConfigDir),
        storybookLogFile: maybe(storybookLogFile),
        traceChanged: maybe(traceChanged),
        untraced: maybe(untraced),
        uploadMetadata: maybe(uploadMetadata, false),
        zip: maybe(zip, false),
        junitReport: maybe(junitReport),
      },
    });

    for (const [key, value] of Object.entries(output)) setOutput(key, String(value));

    if (output.code !== 0) {
      setFailed('non-zero exit code');
    }

    process.exit(output.code);
  } catch (error_) {
    if (error_.message) error(error_.message);
    if (error_.stack) error(error_.stack);
    if (error_.description) error(error_.description);

    setFailed(error_.message);
    process.exit(1);
  }
}

run()
  .catch((runError) => {
    error(runError);
    setFailed(runError.message);
    Sentry.captureException(runError);
  })
  .finally(() => Sentry.flush(2500).finally(() => process.exit()));
