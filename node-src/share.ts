import Listr from 'listr';
import { readPackageUp } from 'read-package-up';
import { v4 as uuid } from 'uuid';

import { InitialContext } from '.';
import { setupContext } from './context';
import getEnvironment from './lib/getEnvironment';
import getOptions from './lib/getOptions';
import { createLogger } from './lib/log';
import NonTTYRenderer from './lib/nonTTYRenderer';
import parseArguments from './lib/parseArguments';
import { confirmShare, ConfirmShareStatus, reserveShare } from './lib/share';
import { renderBuild } from './renderer/build';
import { runShare } from './tasks';
import { Context, Options } from './types';
import { endActivity } from './ui/components/activity';

export interface ShareOptions {
  userToken: string;
  onUrl?: (url: string) => void;
  onProgress?: (progress: number, total: number) => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
  /** Path to write a debug log file. Disabled by default so share() leaves no file behind. */
  logFile?: string;
}

export interface ShareOutput {
  shareUrl: string;
  daysToExpire?: number;
}

/**
 * Share a Storybook without creating a full Chromatic build. Reserves a share URL, runs the upload
 * pipeline, and resolves when the upload is complete.
 *
 * @param shareOptions Options for the share operation.
 * @param shareOptions.userToken The user token for authentication.
 * @param shareOptions.onUrl Callback fired as soon as the share URL is reserved.
 * @param shareOptions.onProgress Callback reporting upload progress as (bytesUploaded, totalBytes).
 * @param shareOptions.onError Callback for errors. When provided, share() resolves instead of
 * rejecting.
 * @param shareOptions.abortSignal An AbortSignal to cancel the share operation.
 * @param shareOptions.logFile Path to write a debug log file. Disabled by default.
 *
 * @returns An object with the share URL.
 */
export async function share(shareOptions: ShareOptions): Promise<ShareOutput> {
  const { onUrl, onError } = shareOptions;

  let ctx: Context;
  try {
    ctx = await setupShareContext(shareOptions);
  } catch (error) {
    if (onError) {
      onError(error);
      return { shareUrl: '' };
    }
    throw error;
  }

  try {
    ctx.share = await reserveShare(ctx);
    // TODO: refactor build/prepare so the share flow doesn't need to stub ctx.git.
    // Today these tasks read ctx.git.changedFiles; empty values satisfy that without
    // affecting behavior, but new reads of ctx.git would silently see empty strings.
    ctx.git = { branch: '', commit: '', committedAt: 0, fromCI: false };

    onUrl?.(ctx.share.shareUrl);

    const daysToExpire = await runUploadAndConfirm(ctx);
    return { shareUrl: ctx.share.shareUrl, daysToExpire };
  } catch (error) {
    if (onError) {
      onError(error);
      return { shareUrl: ctx.share?.shareUrl ?? '' };
    }
    throw error;
  }
}

async function runUploadAndConfirm(ctx: Context): Promise<number | undefined> {
  let status: ConfirmShareStatus = 'complete';
  let uploadError: unknown;
  try {
    await runShareTasks(ctx);
  } catch (error) {
    status = ctx.options.experimental_abortSignal?.aborted ? 'cancelled' : 'error';
    uploadError = error;
  }

  const daysToExpire = await reportShareStatus(ctx, status);

  if (uploadError) {
    throw uploadError;
  }
  return daysToExpire;
}

async function reportShareStatus(ctx: Context, status: ConfirmShareStatus) {
  try {
    const { daysToExpire } = await confirmShare(ctx, status);
    return daysToExpire;
  } catch (error) {
    // Confirm failures are non-fatal: the upload itself already succeeded (or
    // already failed and we're about to surface that error). Log and move on.
    ctx.log.warn(`Failed to confirm share status (${status}): ${error.message}`);
    return;
  }
}

async function setupShareContext(shareOptions: ShareOptions): Promise<Context> {
  const { userToken, onProgress, abortSignal, logFile } = shareOptions;

  const extraOptions: Partial<Options> = {
    userToken,
    ...(abortSignal && { experimental_abortSignal: abortSignal }),
    ...(onProgress && {
      experimental_onTaskProgress: (_ctx: Context, status: { progress: number; total: number }) => {
        onProgress(status.progress, status.total);
      },
    }),
  };
  const config = {
    ...parseArguments([]),
    extraOptions,
  };

  const log = createLogger(config.flags, extraOptions);

  const packageInfo = await readPackageUp({ cwd: process.cwd(), normalize: false });
  if (!packageInfo) {
    throw new Error('No package.json found');
  }

  const { path: packagePath, packageJson } = packageInfo;
  let initialContext: InitialContext = {
    ...config,
    flags: {
      ...config.flags,
      interactive: false,
    },
    packagePath,
    packageJson,
    env: getEnvironment(),
    log,
    sessionId: uuid(),
  };

  initialContext = await setupContext(initialContext);
  const ctx = initialContext as Context;
  ctx.options = getOptions(initialContext);
  ctx.options.logFile = logFile;
  ctx.log.setLogFile(ctx.options.logFile);
  ctx.runtime = { forceRebuild: ctx.options.forceRebuild };
  return ctx;
}

async function runShareTasks(ctx: Context): Promise<void> {
  // `log` isn't on Listr's type but is consumed by the renderer.
  const listrOptions: any = {
    log: ctx.log,
    renderer: NonTTYRenderer,
  };

  try {
    await renderBuild(ctx);
    await new Listr(
      runShare.map((task) => task(ctx)),
      listrOptions
    ).run(ctx);
    ctx.log.debug('Tasks completed');
  } finally {
    endActivity(ctx);
    ctx.log.flush();
  }
}
