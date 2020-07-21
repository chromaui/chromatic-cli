export default class TestLogger {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(...args) {
    this.errors.push(...args);
  }

  warn(...args) {
    this.warnings.push(...args);
  }

  info() {
    // do nothing
  }

  log() {
    // do nothing
  }

  debug() {
    // do nothing
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
}
