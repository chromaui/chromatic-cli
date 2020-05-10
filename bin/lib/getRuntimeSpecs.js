/* eslint-disable no-underscore-dangle */
import { JSDOM, ResourceLoader } from 'jsdom';
import { addShimsToJSDOM } from './jsdom-shims';
import { extract } from '../storybook/extract';

export default async function getRuntimeSpecs(isolatorUrl, virtualConsole) {
  const userAgent = 'Chromatic';
  const jsdom = await JSDOM.fromURL(isolatorUrl, {
    userAgent,
    virtualConsole,
    resources: new ResourceLoader({ userAgent }),
    runScripts: 'dangerously', // We need to execute the scripts on the page
    pretendToBeVisual: true, // Add a requestAnimationFrame polyfill, react@16 warns about it
    beforeParse(window) {
      addShimsToJSDOM(window);
    },
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ContentLoadEvent timed out')), 60000);
      jsdom.window.addEventListener('DOMContentLoaded', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const runtimeSpecs =
      typeof jsdom.window.__chromaticRuntimeSpecs__ === 'function' &&
      !jsdom.window.__chromaticRuntimeSpecs__.isDeprecated
        ? await jsdom.window.__chromaticRuntimeSpecs__()
        : await extract(jsdom.window);

    return runtimeSpecs;
  } finally {
    // cleanup
    jsdom.window.close();
  }
}
