import log from 'npmlog';

log.level = process.env.DISABLE_LOGGING === 'true' ? 'silent' : 'verbose';

export function createLogger(prefix) {
  log.heading = prefix;
  return log;
}

export const separator = '=========================';

export default createLogger('chromatic');
