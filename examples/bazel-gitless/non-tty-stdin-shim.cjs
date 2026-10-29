if (typeof process.stdin.unref !== 'function') {
  process.stdin.unref = () => {};
}
