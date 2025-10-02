import '../node-src/errorMonitoring';

import { error, setFailed, setOutput } from '@actions/core';
import { context } from '@actions/github';
import * as Sentry from '@sentry/node';
import path from 'path';

import { run as runNode } from '../node-src';
import { getInputs } from './getInputs';

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
// eslint-disable-next-line complexity
async function run() {
  const { sha, branch, slug, mergeCommit } = getBuildInfo(context) || {};
  if (!sha || !branch || !slug) return;

  try {
    const inputs = getInputs();

    process.env.CHROMATIC_ACTION = 'true';
    process.env.CHROMATIC_SHA = sha;
    process.env.CHROMATIC_BRANCH = inputs.branchName || branch;
    process.env.CHROMATIC_SLUG = inputs.repositorySlug || slug;
    if (mergeCommit) {
      process.env.CHROMATIC_PULL_REQUEST_SHA = mergeCommit;
    }

    process.chdir(path.join(process.cwd(), inputs.workingDir || ''));

    const output = await runNode({
      options: {
        inAction: true,
      },
      flags: {
        // NOTE: These must match the inputs in getInputs.ts, which must also match ../action.yml
        autoAcceptChanges: maybe(inputs.autoAcceptChanges),
        branchName: maybe(inputs.branchName),
        buildScriptName: maybe(inputs.buildScriptName),
        buildCommand: maybe(inputs.buildCommand),
        configFile: maybe(inputs.configFile),
        cypress: maybe(inputs.cypress),
        debug: maybe(inputs.debug),
        diagnosticsFile: maybe(inputs.diagnosticsFile),
        dryRun: maybe(inputs.dryRun),
        exitOnceUploaded: maybe(inputs.exitOnceUploaded),
        exitZeroOnChanges: maybe(inputs.exitZeroOnChanges, true),
        externals: maybe(inputs.externals),
        fileHashing: maybe(inputs.fileHashing, true),
        forceRebuild: maybe(inputs.forceRebuild),
        ignoreLastBuildOnBranch: maybe(inputs.ignoreLastBuildOnBranch),
        interactive: false,
        junitReport: maybe(inputs.junitReport),
        logFile: maybe(inputs.logFile),
        logLevel: maybe(inputs.logLevel),
        logPrefix: maybe(inputs.logPrefix),
        onlyChanged: maybe(inputs.onlyChanged),
        onlyStoryFiles: maybe(inputs.onlyStoryFiles),
        onlyStoryNames: maybe(inputs.onlyStoryNames),
        outputDir: maybe(inputs.outputDir),
        playwright: maybe(inputs.playwright),
        preserveMissing: maybe(inputs.preserveMissing),
        projectToken: maybe(inputs.projectToken),
        repositorySlug: maybe(inputs.repositorySlug),
        skip: maybe(inputs.skip),
        skipUpdateCheck: maybe(inputs.skipUpdateCheck, false),
        storybookBaseDir: maybe(inputs.storybookBaseDir),
        storybookBuildDir: maybe(inputs.storybookBuildDir),
        storybookConfigDir: maybe(inputs.storybookConfigDir),
        storybookLogFile: maybe(inputs.storybookLogFile),
        traceChanged: maybe(inputs.traceChanged),
        untraced: maybe(inputs.untraced),
        uploadMetadata: maybe(inputs.uploadMetadata, false),
        zip: maybe(inputs.zip, false),
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
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .finally(() => Sentry.flush(2500).finally(() => process.exit()));