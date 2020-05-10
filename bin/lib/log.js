import stripAnsi from 'strip-ansi';

const { DISABLE_LOGGING, LOG_LEVEL } = process.env;

const logLevel = DISABLE_LOGGING === 'true' ? 'silent' : LOG_LEVEL || 'info';
const levels = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const level = levels[logLevel];

export const separator = '=========================';

/* eslint-disable no-console */
export const createLogger = () => {
  let enqueue = false;
  const queue = [];

  const interactive = !process.argv.slice(2).includes('--no-interactive');
  const format = (prefix, args) => (interactive ? args : [prefix, ...args.map(stripAnsi)]);
  const log = type => (...args) => {
    if (level < levels[type]) return;
    const messages = format(type.toUpperCase(), args);
    if (enqueue) queue.push({ type, messages });
    else console[type](...messages);
  };

  return {
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
      if (queue.length) {
        console.log('');
        queue.forEach(({ type, messages }) => console[type](...messages));
      }
      enqueue = false;
    },
  };
};

export default createLogger();
