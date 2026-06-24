import { intro, log, note, outro } from '@clack/prompts';

import { AuthInput, runAuth } from '../tasks/auth';
import { buildStorybook, setBuildCommand, setSourceDirectory } from '../tasks/build';
import {
  applyGitInfoOutput,
  applyGitInfoPartial,
  extractGitInfoInput,
  gatherGitInfo,
} from '../tasks/gitInfo';
import {
  applyInitializeOutput,
  extractInitializeInput,
  initialize as initializeRun,
} from '../tasks/initialize';
import {
  calculateFileHashes,
  traceChangedFiles,
  validateAndroidArtifact,
  validateFiles,
} from '../tasks/prepare';
import { takeSnapshots } from '../tasks/snapshot';
import { applyStorybookInfoOutput, setStorybookInfo } from '../tasks/storybookInfo';
import { uploadStorybook } from '../tasks/upload';
import { publishBuild, verifyBuild } from '../tasks/verify';
import { Context, Deps, Task } from '../types';
import missingProjectToken from '../ui/messages/errors/missingProjectToken';
import introMessage from '../ui/messages/info/intro';
import * as authUi from '../ui/tasks/auth';
import * as buildUi from '../ui/tasks/build';
import * as gitInfoUi from '../ui/tasks/gitInfo';
import * as initializeUi from '../ui/tasks/initialize';
import * as prepareUi from '../ui/tasks/prepare';
import * as snapshotUi from '../ui/tasks/snapshot';
import * as storybookInfoUi from '../ui/tasks/storybookInfo';
import * as uploadUi from '../ui/tasks/upload';
import * as verifyUi from '../ui/tasks/verify';
import { withSpinner } from './withSpinner';

const buildDeps = (ctx: Context): Deps => ({
  log: ctx.log,
  client: ctx.client,
  http: ctx.http,
  env: ctx.env,
  options: ctx.options,
  runtime: ctx.runtime,
  analytics: ctx.analytics,
  pkg: ctx.pkg,
  sessionId: ctx.sessionId,
  packageJson: ctx.packageJson,
});

const extractAuthInput = (ctx: Context): AuthInput => {
  const { projectId, projectToken, userToken } = ctx.options;
  if (projectId && userToken) {
    return { mode: 'cli', projectId, userToken, projectToken };
  }
  if (!projectToken) {
    throw new Error(missingProjectToken());
  }
  return { mode: 'app', projectToken };
};

/**
 * Imperative happy path function prototyping Clack-based UI. Takes in the prepared context from bin.ts, and
 * then just calls each task in sequence, passing `ctx` along each time. For tasks that are migrated to the
 * typed input/deps structure, we basically just extract input, call the task, apply output, and then set the
 * Clack spinner based on the existing transition functions. For tasks that aren't migrated, a lot of them take
 * the Listr task itself as an argument and mutate the title/output. For that, I made a small shim in `withSpinner.ts`
 * that uses getters and setters to call the relevant Clack functions. The shape matches the Listr task, so the task
 * functions themselves are unchanged. This is not pretty, but my goal with the prototype was primarily to see what
 * an imperative paradigm for running the tasks and managing the UI would look like, as opposed to our tasks-as-objects
 * paradigm that we currently use with Listr.
 */
// eslint-disable-next-line complexity
export async function clackMain(ctx: Context): Promise<void> {
  intro(introMessage(ctx));

  // --- auth ---
  await withSpinner(
    ctx,
    authUi.authenticating(ctx),
    async () => {
      const result = await runAuth(buildDeps(ctx), extractAuthInput(ctx));
      if (result.kind !== 'continue') ctx.skip = true;
    },
    () => authUi.authenticated(ctx)
  );

  // --- gitInfo ---
  // extractGitInfoInput's onSkippingBuild closes over a listrTask to call
  // transitionTo(skippingBuild). We replace the callback before invoking
  // gatherGitInfo, so the bogus listrTask is never used.
  const gitInput = extractGitInfoInput(ctx, {} as never);
  gitInput.onSkippingBuild = (git) => {
    ctx.git = git;
    log.info(`Skipping build for commit ${git.commit.slice(0, 7)}`);
  };

  let gitInfoFinal: { title: string; output?: string } | undefined;
  await withSpinner(ctx, gitInfoUi.pending(), async (shim: Task) => {
    const result = await gatherGitInfo(buildDeps(ctx), gitInput);
    if (result.kind === 'continue') {
      applyGitInfoOutput(ctx, result.output);
      gitInfoFinal = gitInfoUi.success(ctx);
    } else if (result.kind === 'partial') {
      applyGitInfoPartial(ctx, result.output);
      gitInfoFinal =
        result.output.phase === 'skip-commit'
          ? gitInfoUi.skippedForCommit(ctx)
          : gitInfoUi.skippedRebuild();
    }
    if (gitInfoFinal) {
      shim.title = gitInfoFinal.title;
      shim.output = gitInfoFinal.output ?? '';
    }
  });

  if (ctx.skip) {
    outro('Build skipped.');
    return;
  }

  // --- storybookInfo ---
  await withSpinner(
    ctx,
    storybookInfoUi.pending(ctx),
    async () => {
      const result = await setStorybookInfo(buildDeps(ctx), {
        gitRootPath: ctx.git?.rootPath,
      });
      if (result.kind === 'continue') applyStorybookInfoOutput(ctx, result.output);
    },
    () => storybookInfoUi.success(ctx)
  );

  // --- initialize ---
  await withSpinner(
    ctx,
    initializeUi.pending(),
    async () => {
      const result = await initializeRun(buildDeps(ctx), extractInitializeInput(ctx));
      if (result.kind === 'continue') await applyInitializeOutput(ctx, result.output);
    },
    () => initializeUi.success(ctx)
  );

  // --- build (web-only happy path; RN / prebuilt / E2E paths out of scope) ---
  await withSpinner(ctx, buildUi.initial(ctx), async (shim: Task) => {
    await setSourceDirectory(ctx);
    await setBuildCommand(ctx);
    const p = buildUi.pending(ctx);
    shim.title = p.title;
    shim.output = p.output ?? '';
    await buildStorybook(ctx);
    const s = buildUi.success(ctx);
    shim.title = s.title;
    shim.output = s.output ?? '';
  });

  // --- prepare ---
  await withSpinner(ctx, prepareUi.initial(ctx), async (shim: Task) => {
    const v = prepareUi.validating(ctx);
    shim.title = v.title;
    shim.output = v.output ?? '';
    await validateFiles(ctx);
    await validateAndroidArtifact(ctx);
    await traceChangedFiles(ctx, shim);
    await calculateFileHashes(ctx, shim);
    const s = prepareUi.success(ctx);
    shim.title = s.title;
    shim.output = s.output ?? '';
  });

  // --- upload ---
  if (ctx.options.dryRun) {
    log.info(uploadUi.dryRun(ctx).output ?? 'Skipped upload');
  } else {
    await withSpinner(ctx, uploadUi.initial(ctx), async (shim: Task) => {
      const start = uploadUi.starting(ctx);
      shim.title = start.title;
      shim.output = start.output ?? '';
      await uploadStorybook(ctx, shim);
      const s = uploadUi.success(ctx);
      shim.title = s.title;
      shim.output = s.output ?? '';
    });
  }

  // --- verify ---
  if (ctx.options.dryRun) {
    log.info(verifyUi.dryRun(ctx).output ?? 'Skipped verify');
  } else {
    await withSpinner(ctx, verifyUi.initial(ctx), async (shim: Task) => {
      const p = verifyUi.pending(ctx);
      shim.title = p.title;
      shim.output = p.output ?? '';
      await publishBuild(ctx);
      await verifyBuild(ctx, shim);
    });
  }

  // --- snapshot ---
  if (ctx.options.dryRun) {
    log.info(snapshotUi.dryRun(ctx).output ?? 'Skipped snapshot');
  } else if (ctx.skipSnapshots) {
    log.info(snapshotUi.skipped(ctx).output ?? 'Skipped snapshot');
  } else {
    await withSpinner(ctx, snapshotUi.initial(ctx), async (shim: Task) => {
      const p = snapshotUi.pending(ctx);
      shim.title = p.title;
      shim.output = p.output ?? '';
      await takeSnapshots(ctx, shim);
    });
  }

  if (ctx.build?.webUrl) {
    note(`View build at ${ctx.build.webUrl}`, 'Done');
  }
  outro('Chromatic finished.');
}
