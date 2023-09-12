import readPkgUp from 'read-pkg-up';
import { v4 as uuid } from 'uuid';
import 'any-observable/register/zen';

import HTTPClient from './io/HTTPClient';
import getEnv from './lib/getEnv';
import { createLogger } from './lib/log';
import parseArgs from './lib/parseArgs';
import { Context, Flags, Options } from './types';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { runBuild } from './runBuild';
import checkForUpdates from './lib/checkForUpdates';
import checkPackageJson from './lib/checkPackageJson';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import invalidPackageJson from './ui/messages/errors/invalidPackageJson';
import noPackageJson from './ui/messages/errors/noPackageJson';
import { getBranch, getCommit, getSlug, getUserEmail, getUncommittedHash } from './git/git';
import { emailHash } from './lib/emailHash';
/**
 Make keys of `T` outside of `R` optional.
*/
type AtLeast<T, R extends keyof T> = Partial<T> & Pick<T, R>;

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

export type { Flags, Options, TaskName, Context, Configuration } from './types';

export async function run({
  argv = [],
  flags,
  options,
}: {
  argv?: string[];
  flags?: Flags;
  options?: Partial<Options>;
}): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);

  const pkgInfo = await readPkgUp({ cwd: process.cwd() });
  if (!pkgInfo) {
    log.error(noPackageJson());
    process.exit(253);
  }

  const { path: packagePath, packageJson } = pkgInfo;
  if (typeof packageJson !== 'object' || typeof packageJson.scripts !== 'object') {
    log.error(invalidPackageJson(packagePath));
    process.exit(252);
  }

  const ctx: AtLeast<
    Context,
    'argv' | 'flags' | 'help' | 'pkg' | 'packagePath' | 'packageJson' | 'env' | 'log' | 'sessionId'
  > = {
    ...parseArgs(argv),
    packagePath,
    packageJson,
    env,
    log,
    sessionId,
    ...(flags && { flags }),
  };

  setExitCode(ctx, exitCodes.OK);

  ctx.http = (ctx.http as HTTPClient) || new HTTPClient(ctx);
  ctx.extraOptions = options;

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

export async function runAll(ctx) {
  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]);

  if (ctx.exitCode === 0 || ctx.exitCode === 1) {
    await checkPackageJson(ctx);
  }

  if (ctx.flags.diagnostics) {
    await writeChromaticDiagnostics(ctx);
  }
}

export type GitInfo = {
  slug: string;
  branch: string;
  commit: string;
  committedAt: number;
  committerEmail: string;
  committerName: string;
  uncommittedHash: string;
  userEmail: string;
  userEmailHash: string;
};

export async function getGitInfo(): Promise<GitInfo> {
  const slug = await getSlug();
  const branch = await getBranch();
  const commitInfo = await getCommit();
  const userEmail = await getUserEmail();
  const userEmailHash = emailHash(userEmail);

  const [ownerName, repoName, ...rest] = slug ? slug.split('/') : [];
  const isValidSlug = !!ownerName && !!repoName && !rest.length;

  const uncommittedHash = await getUncommittedHash();
  return {
    slug: isValidSlug ? slug : '',
    branch,
    ...commitInfo,
    uncommittedHash,
    userEmail,
    userEmailHash,
  };
}

export { getConfiguration } from './lib/getConfiguration';
