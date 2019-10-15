/* eslint-env browser */

export default function() {
  const isChromatic =
    window.navigator.userAgent.match(/Chromatic/) || window.location.href.match(/chromatic=true/);

  return isChromatic;
}
