import Listr from 'listr';

import { Context, InitialContext } from '.';
import GraphQLClient from './io/GraphQLClient';
import NonTTYRenderer from './lib/NonTTYRenderer';
import { getConfiguration } from './lib/getConfiguration';
import getOptions from './lib/getOptions';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { rewriteErrorMessage } from './lib/utils';
import getTasks from './tasks';
import { endActivity } from './ui/components/activity';
import buildCanceled from './ui/messages/errors/buildCanceled';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import missingStories from './ui/messages/errors/missingStories';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';

const initialize = async (ctx: InitialContext): Promise<Context | null> => {
  ctx.log.info('');
  ctx.log.info(intro(ctx));

  try {
    ctx.configuration = await getConfiguration(
      ctx.extraOptions?.configFile || ctx.flags.configFile
    );
    return { ...ctx, options: getOptions(ctx) } as Context;
  } catch (e) {
    ctx.log.info('');
    ctx.log.error(fatalError(ctx, [e]));
    ctx.extraOptions?.experimental_onTaskError?.(ctx, {
      formattedError: fatalError(ctx, [e]),
      originalError: e,
    });
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
    return null;
  }
};

export async function runBuild(initialContext: InitialContext) {
  const ctx = await initialize(initialContext);
  if (!ctx) return;

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
      if (ctx.options.experimental_abortSignal?.aborted) {
        setExitCode(ctx, exitCodes.BUILD_WAS_CANCELED, true);
        throw rewriteErrorMessage(err, buildCanceled());
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
    const formattedError = fatalError(ctx, errors);

    ctx.options.experimental_onTaskError?.(ctx, {
      formattedError,
      originalError: errors[0],
    });

    if (!ctx.userError) {
      ctx.log.info('');
      ctx.log.error(formattedError);
    }

    if (!ctx.exitCode) {
      setExitCode(ctx, exitCodes.UNKNOWN_ERROR);
    }
  }
}
