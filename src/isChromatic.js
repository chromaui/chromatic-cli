/* eslint-env browser */

export default function isChromatic() {
  return (
    window.navigator.userAgent.match(/Chromatic/) || window.location.href.match(/chromatic=true/)
  );
}
