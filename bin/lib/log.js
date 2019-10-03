import log from 'npmlog';
import { getProductVariables } from './cli';

log.level = process.env.DISABLE_LOGGING === 'true' ? 'silent' : process.env.LOG_LEVEL || 'info';

export function createLogger(prefix) {
  log.heading = prefix;
  return log;
}

export const separator = '=========================';

const names = getProductVariables();

export default createLogger(names.product);
