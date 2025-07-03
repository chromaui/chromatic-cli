import { vi } from 'vitest';

import { Logger } from './log';

/**
 * A test logger with spy functions for testing.
 */
export default class TestLogger implements Logger {
  entries: any[];
  errors: any[];
  warnings: any[];
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  file: ReturnType<typeof vi.fn>;
  queue: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  setLogFile: ReturnType<typeof vi.fn>;
  getLevel: ReturnType<typeof vi.fn>;

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
  }
}
