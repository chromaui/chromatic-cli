/* eslint-disable no-underscore-dangle */
import retry from 'async-retry';
import { JSDOM, ResourceLoader } from 'jsdom';

import { extractStoryData } from './extractStoryData';
import { addShimsToJSDOM } from './jsdomShims';

export default async function getRuntimeSpecs(ctx, virtualConsole) {
  const { isolatorUrl, log } = ctx;
  try {
    const userAgent = 'Chromatic';
    const jsdom = await retry(
      () =>
        JSDOM.fromURL(isolatorUrl, {
          userAgent,
          virtualConsole,
          resources: new ResourceLoader({ userAgent }),
          runScripts: 'dangerously', // We need to execute the scripts on the page
          pretendToBeVisual: true, // Add a requestAnimationFrame polyfill, react@16 warns about it
          beforeParse(window) {
            addShimsToJSDOM(window);
          },
        }),
      {
        retries: 3,
        onRetry: (err, n) => log.debug({ err }, `JSDOM failed to connect; retrying ${n}/3`),
      }
    );

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
          : await extractStoryData(jsdom.window);

      return runtimeSpecs;
    } finally {
      // cleanup
      jsdom.window.close();
    }
  } catch (e) {
    if (e.name === 'StatusCodeError') {
      e.message = `Connection to Storybook via JSDOM failed - status code ${e.statusCode}`;
    }
    throw e;
  }
}
