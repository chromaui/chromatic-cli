import Listr from 'listr';
import { v4 as uuid } from 'uuid';

import GraphQLClient from './io/GraphQLClient';
import getOptions from './lib/getOptions';
import parseArgs from './lib/parseArgs';
import { createLogger } from './lib/log';
import checkForUpdates from './lib/checkForUpdates';
import getTasks from './tasks';

import intro from './ui/messages/info/intro';
import fatalError from './ui/messages/errors/fatalError';
import taskError from './ui/messages/errors/taskError';
import runtimeError from './ui/messages/errors/runtimeError';

export async function main(argv) {
  const sessionId = uuid();
  const log = createLogger(sessionId);
  const context = { sessionId, log, ...parseArgs(argv) };

  // Run these two in parallel; checkForUpdates never fails
  await Promise.all([run(context), checkForUpdates(context)]);

  log.info('');
  process.exit(context.exitCode);
}

export async function run(ctx) {
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
      uri: `${ctx.options.indexUrl}/graphql`,
      headers: {
        'x-chromatic-session-id': ctx.sessionId,
        'x-chromatic-cli-version': ctx.pkg.version,
      },
      retries: 3,
    });

    try {
      ctx.log.info('');
      ctx.log.queue(); // queue up any log messages while Listr is running
      await new Listr(getTasks(ctx.options)).run(ctx);
    } catch (err) {
      try {
        // DOMException doesn't allow setting the message, so this might fail
        err.message = taskError(ctx, err);
      } catch (ex) {
        const error = new Error(taskError(ctx, err));
        error.stack = err.stack; // try to preserve the original stack
        throw error;
      }
      throw err;
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
