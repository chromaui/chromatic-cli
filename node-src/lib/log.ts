import debug from 'debug';
import { createWriteStream, unlink } from 'fs';
import stripAnsi from 'strip-ansi';
import { format } from 'util';

import { errorSerializer } from './logSerializers';

const { DISABLE_LOGGING, LOG_LEVEL = '' } = process.env;
const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const DEFAULT_LEVEL = 'info';

export const CHROMATIC_LOG_FILE = 'chromatic.log';

// Top-level promise rejection handler to deal with initialization errors
const handleRejection = (reason: string) => console.error('Unhandled promise rejection:', reason);
process.on('unhandledRejection', handleRejection);

// Omits any JSON metadata, returning only the message string
const logInteractive = (args: any[]) =>
  args.map((arg) => (arg && arg.message) || arg).filter((arg) => typeof arg === 'string');

// Strips ANSI codes from messages and stringifies metadata to JSON
const logVerbose = (type: string, args: any[]) => {
  const stringify =
    type === 'error' ? (e: any) => JSON.stringify(errorSerializer(e)) : JSON.stringify;
  return args.map((arg) => (typeof arg === 'string' ? stripAnsi(arg) : stringify(arg)));
};

type LogType = 'error' | 'warn' | 'info' | 'debug';
type LogFn = (...args: any[]) => void;
export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  log: LogFn;
  file: LogFn;
  debug: LogFn;
  queue: () => void;
  flush: () => void;
  setLevel: (value: keyof typeof LOG_LEVELS) => void;
  setInteractive: (value: boolean) => void;
}

export const createLogger = () => {
  let level = (LOG_LEVEL.toLowerCase() as keyof typeof LOG_LEVELS) || DEFAULT_LEVEL;
  if (DISABLE_LOGGING === 'true') level = 'silent';
  if (level !== 'silent') unlink(CHROMATIC_LOG_FILE, () => {});

  let interactive = !process.argv.slice(2).includes('--no-interactive');
  let enqueue = false;
  const queue = [];

  const stream = level !== 'silent' ? createWriteStream(CHROMATIC_LOG_FILE, { flags: 'a' }) : null;
  const appendToLogFile = (...messages: string[]) => stream?.write(messages.join(' ') + '\n');

  const log =
    (type: LogType, logFileOnly?: boolean) =>
    (...args: any[]) => {
      if (LOG_LEVELS[level] < LOG_LEVELS[type]) return;

      const logs = logVerbose(type, args);
      appendToLogFile(...logs);
      if (logFileOnly) return;

      const messages = interactive ? logInteractive(args) : logs;
      if (!messages.length) return;

      // Queue up the logs or print them right away
      if (enqueue) queue.push({ type, messages });
      else console[type](...messages);
    };

  const logger: Logger = {
    setLevel(value: keyof typeof LOG_LEVELS) {
      if (value in LOG_LEVELS) level = value;
      else throw new Error(`Invalid level, expecting one of ${Object.keys(LOG_LEVELS).join(', ')}`);
    },
    setInteractive(value: boolean) {
      interactive = !!value;
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
        const { type, messages } = queue.shift();
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
