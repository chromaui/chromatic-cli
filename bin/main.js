import Listr from 'listr';

import GraphQLClient from './io/GraphQLClient';
import getContext from './lib/getContext';
import sendDebugToLoggly from './lib/sendDebugToLoggly';
import getTasks from './tasks';

import intro from './ui/intro';
import fatalError from './ui/errors/fatalError';

export async function main(argv) {
  const context = await getContext(argv);
  sendDebugToLoggly(context);
  return run(context);
}

export async function run(context) {
  const { log, options, pkg, sessionId } = context;

  log.info(intro(context));

  try {
    // eslint-disable-next-line no-param-reassign
    context.client = new GraphQLClient({
      uri: `${options.indexUrl}/graphql`,
      headers: { 'x-chromatic-session-id': sessionId, 'x-chromatic-cli-version': pkg.version },
      retries: 3,
    });

    log.queue(); // queue up any log messages while Listr is running
    const { exitCode } = await new Listr(getTasks(options)).run(context);
    process.exitCode = exitCode;
    log.flush();
  } catch (error) {
    log.flush();
    log.error(fatalError(context, error));

    const errors = [].concat(error);

    if (errors.length) {
      log.info('');
      log.error('Problems encountered:');
      log.info('');
      errors.forEach((e, i, l) => {
        log.error(e.message ? e.message.toString() : e.toString());
        if (options.verbose) {
          log.info(e);
        }

        if (i === l.length - 1) {
          // empty line in between errors
          log.info(' ');
        }
      });
    }

    // Not sure what exit code to use but this can mean error.
    process.exitCode = process.exitCode || 255;
  } finally {
    if (context.stopApp) context.stopApp();
    if (context.closeTunnel) context.closeTunnel();
    process.exit(process.exitCode);
  }
}
