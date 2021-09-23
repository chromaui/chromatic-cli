/* eslint-env browser */

export default function isChromatic() {
  return !!(
    typeof window !== 'undefined' &&
    (window.navigator.userAgent.match(/Chromatic/) || window.location.href.match(/chromatic=true/))
  );
}
