import jsonfile from 'jsonfile';
import Listr from 'listr';
import pkgUp from 'pkg-up';
import { v4 as uuid } from 'uuid';

import GraphQLClient from './io/GraphQLClient';
import HTTPClient from './io/HTTPClient';
import checkForUpdates from './lib/checkForUpdates';
import checkPackageJson from './lib/checkPackageJson';
import getEnv from './lib/getEnv';
import getOptions from './lib/getOptions';
import { createLogger } from './lib/log';
import NonTTYRenderer from './lib/NonTTYRenderer';
import parseArgs from './lib/parseArgs';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { rewriteErrorMessage } from './lib/utils';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import getTasks from './tasks';
import { Context } from './types';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import invalidPackageJson from './ui/messages/errors/invalidPackageJson';
import missingStories from './ui/messages/errors/missingStories';
import noPackageJson from './ui/messages/errors/noPackageJson';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';

const { readFile } = jsonfile;

export async function main(argv: string[]) {
  const sessionId: string = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);

  const packagePath = await pkgUp(); // the user's own package.json
  if (!packagePath) {
    log.error(noPackageJson());
    process.exit(253);
  }

  const packageJson: { [key: string]: any } = await readFile(packagePath);
  if (typeof packageJson !== 'object' || typeof packageJson.scripts !== 'object') {
    log.error(invalidPackageJson(packagePath));
    process.exit(252);
  }

  // Warning: chromaui/action directly invokes runAll, so if new properties or arguments are added
  // here, they must also be added to the GitHub Action.
  const ctx: Partial<Context> = {
    env,
    log,
    sessionId,
    packageJson,
    packagePath,
    ...parseArgs(argv),
  };
  await runAll(ctx);

  log.info('');
  process.exit(ctx.exitCode);
}

export async function runAll(ctx) {
  setExitCode(ctx, exitCodes.OK);

  ctx.http = (ctx.http as HTTPClient) || new HTTPClient(ctx);

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]);

  if (ctx.exitCode === 0 || ctx.exitCode === 1) {
    await checkPackageJson(ctx);
  }

  if (ctx.flags.diagnostics) {
    await writeChromaticDiagnostics(ctx);
  }
}

export async function runBuild(ctx: Context & { client?: GraphQLClient }) {
  ctx.log.info('');
  ctx.log.info(intro(ctx));

  try {
    ctx.options = await getOptions(ctx);
  } catch (e) {
    ctx.log.info('');
    ctx.log.error(fatalError(ctx, [e]));
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
    return;
  }

  try {
    ctx.client = new GraphQLClient(ctx, `${ctx.env.CHROMATIC_INDEX_URL}/graphql`, {
      headers: {
        'x-chromatic-session-id': ctx.sessionId,
        'x-chromatic-cli-version': ctx.pkg.version,
      },
      retries: 3,
    });

    try {
      ctx.log.info('');
      if (ctx.options.interactive) ctx.log.queue(); // queue up any log messages while Listr is running
      const options = ctx.options.interactive ? {} : { renderer: NonTTYRenderer, log: ctx.log };
      await new Listr(getTasks(ctx.options), options).run(ctx);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.name === 'StatusCodeError') {
        setExitCode(ctx, exitCodes.FETCH_ERROR);
        throw rewriteErrorMessage(err, fetchError(ctx, err));
      }
      if (err.name === 'GraphQLError') {
        setExitCode(ctx, exitCodes.GRAPHQL_ERROR);
        throw rewriteErrorMessage(err, graphqlError(ctx, err));
      }
      if (err.message.startsWith('Cannot run a build with no stories')) {
        setExitCode(ctx, exitCodes.BUILD_NO_STORIES);
        throw rewriteErrorMessage(err, missingStories(ctx));
      }
      throw rewriteErrorMessage(err, taskError(ctx, err));
    } finally {
      // Handle potential runtime errors from JSDOM
      const { runtimeErrors, runtimeWarnings } = ctx;
      if ((runtimeErrors && runtimeErrors.length) || (runtimeWarnings && runtimeWarnings.length)) {
        ctx.log.info('');
        ctx.log.error(runtimeError(ctx));
      }

      ctx.log.flush();
      if (ctx.stopApp) ctx.stopApp();
      if (ctx.closeTunnel) ctx.closeTunnel();
    }
  } catch (error) {
    const errors = [].concat(error); // GraphQLClient might throw an array of errors

    if (errors.length && !ctx.userError) {
      ctx.log.info('');
      ctx.log.error(fatalError(ctx, errors));
    }

    if (!ctx.exitCode) {
      setExitCode(ctx, exitCodes.UNKNOWN_ERROR);
    }
  }
}
