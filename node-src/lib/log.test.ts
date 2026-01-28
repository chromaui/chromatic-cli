import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

import { createLogger } from './log';

let consoleError: MockInstance<typeof console.error>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleInfo: MockInstance<typeof console.info>;
let consoleDebug: MockInstance<typeof console.debug>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

  vi.useFakeTimers();
  vi.setSystemTime(new Date().setTime(0));
});

afterEach(() => {
  delete process.env.DISABLE_LOGGING;
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_PREFIX;

  consoleError.mockReset();
  consoleWarn.mockReset();
  consoleInfo.mockReset();
  consoleDebug.mockReset();

  vi.useRealTimers();
});

const timestamp = expect.stringMatching(/\d\d:\d\d:\d\d.\d\d\d/);

describe('log prefix', () => {
  it('should use the log prefix from environment variables', () => {
    process.env.LOG_PREFIX = 'env-prefix';
    const logger = createLogger();
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith('env-prefix', 'message');
  });

  it('should use the log prefix from flags', () => {
    process.env.LOG_PREFIX = 'env-prefix';
    const logger = createLogger({ logPrefix: 'flag-prefix' });
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith('flag-prefix', 'message');
  });

  it('should prefer the log prefix from options', () => {
    process.env.LOG_PREFIX = 'env-prefix';
    const logger = createLogger({ logPrefix: 'flag-prefix' }, { logPrefix: 'option-prefix' });
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith('option-prefix', 'message');
  });

  it('should use a timestamp as prefix by default', () => {
    const logger = createLogger();
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith(timestamp, 'message');
  });

  it('should not use a prefix if set to an empty string', () => {
    process.env.LOG_PREFIX = '';
    const logger = createLogger();
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith('message');
  });

  it('should not use a prefix in interactive mode', () => {
    process.env.LOG_PREFIX = 'env-prefix';
    const logger = createLogger({ interactive: true, logPrefix: 'flag-prefix' });
    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith('message');
  });
});

describe('log levels', () => {
  it('should ignore debug messages by default', () => {
    const logger = createLogger();

    logger.error('error', 1, 2);
    expect(consoleError).toHaveBeenCalledWith(timestamp, 'error', '1', '2');

    logger.warn('warning', 1, 2);
    expect(consoleWarn).toHaveBeenCalledWith(timestamp, 'warning', '1', '2');

    logger.info('message', 1, 2);
    expect(consoleInfo).toHaveBeenCalledWith(timestamp, 'message', '1', '2');

    logger.debug('data', 1, 2);
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it('should use the log level from environment variables', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger();

    logger.error('error');
    expect(consoleError).toHaveBeenCalledWith(timestamp, 'error');

    logger.warn('warning');
    expect(consoleWarn).toHaveBeenCalledWith(timestamp, 'warning');

    logger.info('message');
    expect(consoleInfo).toHaveBeenCalledWith(timestamp, 'message');

    logger.debug('data');
    expect(consoleDebug).toHaveBeenCalledWith(timestamp, 'data');
  });

  it('should use the log level from flags', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger({ logLevel: 'warn' });

    logger.error('error');
    expect(consoleError).toHaveBeenCalledWith(timestamp, 'error');

    logger.warn('warning');
    expect(consoleWarn).toHaveBeenCalledWith(timestamp, 'warning');

    logger.info('message');
    expect(consoleInfo).not.toHaveBeenCalled();

    logger.debug('data');
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it('should prefer the log level from options', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger({ logLevel: 'warn' }, { logLevel: 'error' });

    logger.error('error');
    expect(consoleError).toHaveBeenCalledWith(timestamp, 'error');

    logger.warn('warning');
    expect(consoleWarn).not.toHaveBeenCalled();

    logger.info('message');
    expect(consoleInfo).not.toHaveBeenCalled();

    logger.debug('data');
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it('should respect DISABLE_LOGGING regardless of logLevel flag or option', () => {
    process.env.DISABLE_LOGGING = 'true';
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger({ logLevel: 'warn' }, { logLevel: 'error' });
    logger.error('error');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

it('stringifies non-primitive values', () => {
  const logger = createLogger();
  logger.info('message', 1, true, null, undefined, { key: 'value' });
  expect(consoleInfo).toHaveBeenCalledWith(
    timestamp,
    'message',
    '1',
    'true',
    'null',
    undefined,
    JSON.stringify({ key: 'value' })
  );
});
