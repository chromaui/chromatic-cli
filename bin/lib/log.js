import log from 'npmlog';

log.level = process.env.DISABLE_LOGGING === 'true' ? 'silent' : process.env.LOG_LEVEL || 'info';

export function createLogger(prefix) {
  log.heading = prefix;
  return log;
}

export const separator = '=========================';

export default createLogger('chromatic');
