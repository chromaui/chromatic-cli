/**
 * A noop logger used during tests.
 */
export default class TestLogger {
  entries: any[];

  errors: any[];

  warnings: any[];

  constructor() {
    this.entries = [];
    this.errors = [];
    this.warnings = [];
  }

  error(...args) {
    this.entries.push(...args);
    this.errors.push(...args);
  }

  warn(...args) {
    this.entries.push(...args);
    this.warnings.push(...args);
  }

  info(...args) {
    this.entries.push(...args);
  }

  log(...args) {
    this.entries.push(...args);
  }

  debug(...args) {
    this.entries.push(...args);
  }

  queue() {
    // do nothing
  }

  flush() {
    // do nothing
  }

  setLevel() {
    // do nothing
  }

  setInteractive() {
    // do nothing
  }

  setLogFile() {
    // do nothing
  }
}
