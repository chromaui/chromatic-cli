import logUpdate from 'log-update';
import Listr from 'listr';

import GraphQLClient from './io/GraphQLClient';
import getContext from './lib/getContext';
import sendDebugToLoggly from './lib/sendDebugToLoggly';
import getTasks from './tasks';

import intro from './ui/intro';
import fatalError from './ui/errors/fatalError';
import runtimeError from './ui/errors/runtimeError';

export async function main(argv) {
  const context = await getContext(argv);
  sendDebugToLoggly(context);
  return run(context);
}

export async function run(context) {
  const { log, options, pkg, sessionId } = context;

  log.info('');
  log.info(intro(context));

  try {
    // eslint-disable-next-line no-param-reassign
    context.client = new GraphQLClient({
      uri: `${options.indexUrl}/graphql`,
      headers: { 'x-chromatic-session-id': sessionId, 'x-chromatic-cli-version': pkg.version },
      retries: 3,
    });

    log.queue(); // queue up any log messages while Listr is running
    await new Listr(getTasks(options)).run(context);
    log.flush();
  } catch (error) {
    log.flush();

    const errors = [].concat(error); // GraphQLClient might throw an array of errors

    if (errors.length) {
      log.info('');
      log.error(fatalError(context, errors));
    }

    // Not sure what exit code to use but this can mean error.
    // eslint-disable-next-line no-param-reassign
    if (!context.exitCode) context.exitCode = 255;
  } finally {
    const { exitCode, runtimeErrors, runtimeWarnings, stopApp, closeTunnel } = context;

    if ((runtimeErrors && runtimeErrors.length) || (runtimeWarnings && runtimeWarnings.length)) {
      log.info('');
      log.error(runtimeError(context));
    }

    log.info('');
    if (stopApp) stopApp();
    if (closeTunnel) closeTunnel();
    process.exit(exitCode);
  }
}
