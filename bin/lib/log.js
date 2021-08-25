/* eslint-disable no-console */
import debug from 'debug';
import { createClient } from 'node-loggly-bulk/lib/loggly/client';
import stripAnsi from 'strip-ansi';
import { format } from 'util';

import { errorSerializer } from './logSerializers';

const { DISABLE_LOGGING, LOG_LEVEL = '' } = process.env;
const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const DEFAULT_LEVEL = 'info';

// Top-level promise rejection handler to deal with initialization errors
const handleRejection = (reason) => console.error('Unhandled promise rejection:', reason);
process.on('unhandledRejection', handleRejection);

// Omits any JSON metadata, returning only the message string
const logInteractive = (args) =>
  args.map((arg) => (arg && arg.message) || arg).filter((arg) => typeof arg === 'string');

// Strips ANSI codes from messages and stringifies metadata to JSON
const logVerbose = (type, args) => {
  const stringify = type === 'error' ? (e) => JSON.stringify(errorSerializer(e)) : JSON.stringify;
  return args.map((arg) => (typeof arg === 'string' ? stripAnsi(arg) : stringify(arg)));
};

export const createLogger = (sessionId, env) => {
  let level = DISABLE_LOGGING === 'true' ? 'silent' : LOG_LEVEL.toLowerCase() || DEFAULT_LEVEL;
  let interactive = !process.argv.slice(2).includes('--no-interactive');
  let enqueue = false;
  const queue = [];

  const logglyClient = createClient({
    token: env.LOGGLY_CUSTOMER_TOKEN,
    subdomain: 'hichroma',
    tags: ['chromatic-cli'],
    json: true,
  });

  const log =
    (type) =>
    (...args) => {
      if (LOG_LEVELS[level] < LOG_LEVELS[type]) return;

      // Convert the messages to an appropriate format
      const messages = interactive ? logInteractive(args) : logVerbose(type, args);
      if (!messages.length) return;

      // Queue up the logs or print them right away
      if (enqueue) queue.push({ type, messages });
      else console[type](...messages);

      // Also send logs to Loggly
      logglyClient.log(messages.map((msg) => ({ sessionId, msg })));
    };

  const logger = {
    setLevel(value) {
      if (value in LOG_LEVELS) level = value;
      else throw new Error(`Invalid level, expecting one of ${Object.keys(LOG_LEVELS).join(', ')}`);
    },
    setInteractive(value) {
      interactive = !!value;
    },
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    log: log('info'),
    debug: log('debug'),
    queue: () => {
      enqueue = true;
    },
    flush: () => {
      while (queue.length > 0) {
        const { type, messages } = queue.shift();
        console.log('');
        console[type](...messages);
      }
      enqueue = false;
    },
  };

  // Intercept Localtunnel's logging
  debug.enable('localtunnel:*');
  debug.log = (...args) => log.debug(format(...args));

  // Redirect unhandled promise rejections
  process.off('unhandledRejection', handleRejection);
  process.on('unhandledRejection', (reason) =>
    logger.error('Unhandled promise rejection:', reason)
  );

  return logger;
};
