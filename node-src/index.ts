import 'any-observable/register/zen';
import readPkgUp from 'read-pkg-up';
import { v4 as uuid } from 'uuid';

import { getBranch, getCommit, getSlug, getUncommittedHash, getUserEmail } from './git/git';
import HTTPClient from './io/HTTPClient';
import checkForUpdates from './lib/checkForUpdates';
import checkPackageJson from './lib/checkPackageJson';
import { emailHash } from './lib/emailHash';
import getEnv from './lib/getEnv';
import { createLogger } from './lib/log';
import parseArgs from './lib/parseArgs';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import { runBuild } from './runBuild';
import { Context, Flags, Options } from './types';
import invalidPackageJson from './ui/messages/errors/invalidPackageJson';
import noPackageJson from './ui/messages/errors/noPackageJson';
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

export type { Configuration, Context, Flags, Options, TaskName } from './types';

export type InitialContext = Omit<
  AtLeast<
    Context,
    | 'argv'
    | 'flags'
    | 'help'
    | 'pkg'
    | 'extraOptions'
    | 'packagePath'
    | 'packageJson'
    | 'env'
    | 'log'
    | 'sessionId'
  >,
  'options'
>;

export async function run({
  argv = [],
  flags,
  options: extraOptions,
}: {
  argv?: string[];
  flags?: Flags;
  options?: Partial<Options>;
}): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger();

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

  const ctx: InitialContext = {
    ...parseArgs(argv),
    ...(flags && { flags }),
    ...(extraOptions && { extraOptions }),
    packagePath,
    packageJson,
    env,
    log,
    sessionId,
  };

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

export async function runAll(ctx: InitialContext) {
  setExitCode(ctx, exitCodes.OK);

  ctx.http = (ctx.http as HTTPClient) || new HTTPClient(ctx);

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]);

  // At this point we may or may not have options on context
  if ([0, 1].includes(ctx.exitCode) && 'options' in ctx) {
    await checkPackageJson(ctx as Context);
  }
  if (ctx.flags?.diagnostics || ctx.extraOptions?.diagnostics) {
    await writeChromaticDiagnostics(ctx as Context | InitialContext);
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
