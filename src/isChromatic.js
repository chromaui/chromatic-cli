/* eslint-env browser */

const isChromatic =
  window.navigator.userAgent.match(/Chromatic/) || window.location.href.match(/chromatic=true/);

export default function() {
  return isChromatic;
}
