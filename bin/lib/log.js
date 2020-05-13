import debug from 'debug';
import loggly from 'node-loggly-bulk';
import stripAnsi from 'strip-ansi';
import { format } from 'util';

import { LOGGLY_CUSTOMER_TOKEN } from '../constants';
import { errorSerializer } from './logSerializers';

const { DISABLE_LOGGING, LOG_LEVEL } = process.env;

const logLevel = DISABLE_LOGGING === 'true' ? 'silent' : LOG_LEVEL || 'info';
const levels = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const level = levels[logLevel];
const interactive = !process.argv.slice(2).includes('--no-interactive');

const addPrefix = prefix => arg =>
  arg
    .split('\n')
    .map(line => `${prefix} ${line}`)
    .join('\n');

// Omits any JSON metadata, returning only the message string
const logInteractive = args =>
  args.map(arg => (arg && arg.message) || arg).filter(arg => typeof arg === 'string');

// Strips ANSI codes from messages, stringifies metadata to JSON and adds a prefix
const logVerbose = (type, args) => {
  const stringify = type === 'error' ? e => JSON.stringify(errorSerializer(e)) : JSON.stringify;
  return args
    .map(arg => (typeof arg === 'string' ? stripAnsi(arg) : stringify(arg)))
    .map(addPrefix(type.toUpperCase()));
};

export const createLogger = sessionId => {
  let enqueue = false;
  const queue = [];

  const logglyClient = loggly.createClient({
    token: LOGGLY_CUSTOMER_TOKEN,
    subdomain: 'hichroma',
    tags: ['chromatic-cli'],
    json: true,
  });

  /* eslint-disable no-console */
  const log = type => (...args) => {
    if (level < levels[type]) return;

    // Convert the messages to an appropriate format
    const messages = interactive ? logInteractive(args) : logVerbose(type, args);
    if (!messages.length) return;

    // Queue up the logs or print them right away
    if (enqueue) queue.push({ type, messages });
    else console[type](...messages);

    // Also send logs to Loggly
    logglyClient.log(messages.map(msg => ({ sessionId, msg })));
  };

  const logger = {
    level: logLevel,
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

  return logger;
};
