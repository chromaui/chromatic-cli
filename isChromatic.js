/* eslint-disable unicorn/prefer-module */

module.exports = function isChromatic(windowArgument) {
  const windowToCheck = windowArgument || (globalThis.window !== undefined && globalThis);
  return !!(
    windowToCheck &&
    (/Chromatic/.test(windowToCheck.navigator.userAgent) ||
      /chromatic=true/.test(windowToCheck.location.href))
  );
};
