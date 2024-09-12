/* eslint-env browser */

module.exports = function isChromatic(windowArg) {
  const windowToCheck = windowArg || (typeof window !== 'undefined' && window);
  return !!(
    windowToCheck &&
    (/Chromatic/.test(windowToCheck.navigator.userAgent) ||
      /chromatic=true/.test(windowToCheck.location.href))
  );
};
