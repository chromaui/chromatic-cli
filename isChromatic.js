/* eslint-env browser */

// eslint-disable-next-line unicorn/prefer-module
module.exports = function isChromatic(windowArgument) {
  // eslint-disable-next-line unicorn/prefer-global-this
  const windowToCheck = windowArgument || (typeof window !== 'undefined' && window);
  return !!(
    windowToCheck &&
    (/Chromatic/.test(windowToCheck.navigator.userAgent) ||
      /chromatic=true/.test(windowToCheck.location.href))
  );
};
