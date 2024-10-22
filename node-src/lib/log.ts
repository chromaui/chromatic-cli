import chalk from 'chalk';
import debug from 'debug';
import { createWriteStream, rm } from 'fs';
import stripAnsi from 'strip-ansi';
import { format } from 'util';

import { Flags, Options } from '../types';
import { errorSerializer } from './logSerializers';

interface QueueMessage {
  type: LogType;
  messages: string[];
}

const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const DEFAULT_LEVEL = 'info';

// Top-level promise rejection handler to deal with initialization errors
const handleRejection = (reason: string) => console.error('Unhandled promise rejection:', reason);
process.on('unhandledRejection', handleRejection);

const isPrintable = (value: any, type = typeof value) =>
  type === 'string' || type === 'number' || type === 'boolean';

// Omits any JSON metadata, returning only the message string
const logInteractive = (args: any[]): string[] =>
  args
    .map((argument) => (argument && argument.message) || argument)
    .filter((argument) => isPrintable(argument))
    .map(String);

// Stringifies metadata to JSON
const logVerbose = (type: string, args: any[]) => {
  const stringify =
    type === 'error' ? (err: any) => JSON.stringify(errorSerializer(err)) : JSON.stringify;
  return args.map((argument) => (isPrintable(argument) ? String(argument) : stringify(argument)));
};

// Generate a timestamp like "14:30:00.123" in local time
const getTimeString = () =>
  new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });

const createPrefixer =
  (color = false, prefix?: string) =>
  (messages: string[]) => {
    // Ignore empty log lines
    if (messages.every((message) => /^\s*$/.test(message))) return messages;

    // Use a timestamp as default prefix
    const pre = prefix ?? chalk.dim(getTimeString());
    if (pre === '') return color ? messages : messages.map((message) => stripAnsi(message));

    // Pad lines with spaces to align with the prefix
    const padding = ' '.repeat(stripAnsi(pre).length + 1);
    return [
      color ? pre : stripAnsi(pre),
      ...messages.map((message) => {
        if (typeof message !== 'string') return message;
        const string = color ? message : stripAnsi(message);
        return string.replaceAll('\n', `\n${padding}`);
      }),
    ];
  };

type LogType = 'error' | 'warn' | 'info' | 'debug';
type LogFunction = (...args: any[]) => void;
export interface Logger {
  error: LogFunction;
  warn: LogFunction;
  info: LogFunction;
  log: LogFunction;
  file: LogFunction;
  debug: LogFunction;
  queue: () => void;
  flush: () => void;
  getLevel: () => keyof typeof LOG_LEVELS;
  setLevel: (value: keyof typeof LOG_LEVELS) => void;
  setInteractive: (value: boolean) => void;
  setLogFile: (path: string | undefined) => void;
}

const fileLogger = {
  queue: [] as string[],
  append(...messages: string[]) {
    this.queue.push(...messages, '\n');
  },
  disable() {
    this.append = () => {};
    this.queue = [];
  },
  initialize(path: string, onError: LogFunction) {
    rm(path, { force: true }, (err) => {
      if (err) {
        this.disable();
        onError(err);
      } else {
        const stream = createWriteStream(path, { flags: 'a' });
        this.append = (...messages: string[]) => {
          stream?.write(
            messages
              .reduce((result, message) => result + message + (message === '\n' ? '' : ' '), '')
              .trim() + '\n'
          );
        };
        this.append(...this.queue);
        this.queue = [];
      }
    });
  },
};

/* eslint-disable-next-line complexity */
export const createLogger = (flags: Flags, options?: Partial<Options>) => {
  const { DISABLE_LOGGING, LOG_LEVEL = '', LOG_PREFIX } = process.env;

  let level =
    options?.logLevel ||
    flags.logLevel ||
    (LOG_LEVEL.toLowerCase() as Flags['logLevel']) ||
    DEFAULT_LEVEL;

  if (DISABLE_LOGGING === 'true') {
    level = 'silent';
  }

  let interactive = (options?.interactive || flags.interactive) && !(options?.debug || flags.debug);
  let enqueue = false;
  const queue: QueueMessage[] = [];

  const logPrefixer = createPrefixer(true, options?.logPrefix || flags.logPrefix || LOG_PREFIX);
  const filePrefixer = createPrefixer(false, options?.logPrefix || flags.logPrefix || LOG_PREFIX);
  const log =
    (type: LogType, logFileOnly?: boolean) =>
    (...args: any[]) => {
      if (LOG_LEVELS[level] < LOG_LEVELS[type]) return;

      const logs = logVerbose(type, args);
      fileLogger.append(...filePrefixer(logs));
      if (logFileOnly) return;

      const messages = interactive ? logInteractive(args) : logPrefixer(logs);
      if (messages.length === 0) return;

      // Queue up the logs or print them right away
      if (enqueue) queue.push({ type, messages });
      else console[type](...messages);
    };

  const logger: Logger = {
    getLevel() {
      return level;
    },
    setLevel(value: keyof typeof LOG_LEVELS) {
      if (value in LOG_LEVELS) level = value;
      else throw new Error(`Invalid level, expecting one of ${Object.keys(LOG_LEVELS).join(', ')}`);
    },
    setInteractive(value: boolean) {
      interactive = !!value;
    },
    setLogFile(path: string | undefined) {
      if (path) fileLogger.initialize(path, log('error'));
      else fileLogger.disable();
    },
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    log: log('info'),
    file: log('info', true),
    debug: log('debug'),
    queue: () => {
      enqueue = true;
    },
    flush: () => {
      while (queue.length > 0) {
        const { type, messages } = queue.shift() as QueueMessage;
        console.log('');
        console[type](...messages);
      }
      enqueue = false;
    },
  };

  debug.log = (...args: any[]) => logger.debug(format(...args));

  // Redirect unhandled promise rejections
  process.off('unhandledRejection', handleRejection);
  process.on('unhandledRejection', (reason) =>
    logger.error('Unhandled promise rejection:', reason)
  );

  return logger;
};
