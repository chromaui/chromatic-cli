import Listr from 'listr';

import GraphQLClient from './io/GraphQLClient';
import getOptions from './lib/getOptions';
import NonTTYRenderer from './lib/NonTTYRenderer';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { rewriteErrorMessage } from './lib/utils';
import getTasks from './tasks';
import { Context, Options } from './types';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import missingStories from './ui/messages/errors/missingStories';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';
import { endActivity } from './ui/components/activity';

export async function runBuild(ctx: Context, extraOptions?: Partial<Options>) {
  ctx.log.info('');
  ctx.log.info(intro(ctx));

  try {
    ctx.options = await getOptions(ctx);
    if (extraOptions) ctx.options = { ...ctx.options, ...extraOptions };
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
      endActivity(ctx);
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
