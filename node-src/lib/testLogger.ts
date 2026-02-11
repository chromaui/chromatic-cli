import { Mock, vi } from 'vitest';

import { Logger } from './log';

/**
 * A test logger with spy functions for testing.
 */
export default class TestLogger implements Logger {
  entries: any[];
  errors: any[];
  warnings: any[];
  error: Mock<Logger['error']>;
  warn: Mock<Logger['warn']>;
  info: Mock<Logger['info']>;
  log: Mock<Logger['log']>;
  debug: Mock<Logger['debug']>;
  file: Mock<Logger['file']>;
  queue: Mock<Logger['queue']>;
  flush: Mock<Logger['flush']>;
  setLevel: Mock<Logger['setLevel']>;
  setInteractive: Mock<Logger['setInteractive']>;
  setLogFile: Mock<Logger['setLogFile']>;
  getLevel: Mock<Logger['getLevel']>;
  pause: Mock<Logger['pause']>;
  resume: Mock<Logger['resume']>;

  constructor() {
    this.entries = [];
    this.errors = [];
    this.warnings = [];

    this.error = vi.fn((...args) => {
      this.entries.push(...args);
      this.errors.push(...args);
    });

    this.warn = vi.fn((...args) => {
      this.entries.push(...args);
      this.warnings.push(...args);
    });

    this.info = vi.fn((...args) => {
      this.entries.push(...args);
    });

    this.log = vi.fn((...args) => {
      this.entries.push(...args);
    });

    this.debug = vi.fn((...args) => {
      this.entries.push(...args);
    });

    this.file = vi.fn();
    this.queue = vi.fn();
    this.flush = vi.fn();
    this.setLevel = vi.fn();
    this.setInteractive = vi.fn();
    this.setLogFile = vi.fn();
    this.getLevel = vi.fn();
    this.pause = vi.fn();
    this.resume = vi.fn();
  }
}
