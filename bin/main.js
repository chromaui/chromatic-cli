import { readFile } from 'jsonfile';
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
import { rewriteErrorMessage } from './lib/utils';
import getTasks from './tasks';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import invalidPackageJson from './ui/messages/errors/invalidPackageJson';
import missingStories from './ui/messages/errors/missingStories';
import noPackageJson from './ui/messages/errors/noPackageJson';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';

export async function main(argv) {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);

  const packagePath = await pkgUp(); // the user's own package.json
  if (!packagePath) {
    log.error(noPackageJson());
    process.exit(253);
  }

  const packageJson = await readFile(packagePath);
  if (typeof packageJson !== 'object' || typeof packageJson.scripts !== 'object') {
    log.error(invalidPackageJson(packagePath));
    process.exit(252);
  }

  // Warning: chromaui/action directly invokes runAll, so if new properties or arguments are added
  // here, they must also be added to the GitHub Action.
  const ctx = { env, log, sessionId, packageJson, packagePath, ...parseArgs(argv) };
  await runAll(ctx);

  log.info('');
  process.exit(ctx.exitCode);
}

export async function runAll(ctx) {
  ctx.http = ctx.http || new HTTPClient({ env: ctx.env, log: ctx.log });

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]);

  if (!ctx.exitCode || ctx.exitCode === 1) {
    await checkPackageJson(ctx);
  }
}

export async function runBuild(ctx) {
  ctx.log.info('');
  ctx.log.info(intro(ctx));

  try {
    ctx.options = await getOptions(ctx);
  } catch (e) {
    ctx.log.info('');
    ctx.log.error(e.message);
    ctx.exitCode = 254;
    return;
  }

  try {
    ctx.client = new GraphQLClient({
      uri: `${ctx.env.CHROMATIC_INDEX_URL}/graphql`,
      headers: {
        'x-chromatic-session-id': ctx.sessionId,
        'x-chromatic-cli-version': ctx.pkg.version,
      },
      retries: 3,
      env: ctx.env,
      log: ctx.log,
    });

    try {
      ctx.log.info('');
      if (ctx.options.interactive) ctx.log.queue(); // queue up any log messages while Listr is running
      const options = ctx.options.interactive ? {} : { renderer: NonTTYRenderer, log: ctx.log };
      await new Listr(getTasks(ctx.options), options).run(ctx);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.name === 'StatusCodeError') {
        ctx.log.info('');
        ctx.log.error(fetchError(ctx, err));
        return;
      }
      if (err.message.startsWith('Cannot run a build with no stories')) {
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

    // Not sure what exit code to use but this can mean error.
    if (!ctx.exitCode) ctx.exitCode = 255;
  }
}
