/* eslint-disable no-useless-catch, no-console, no-underscore-dangle */
import { JSDOM, VirtualConsole } from 'jsdom';
import { stripIndents } from 'common-tags';
import { extract } from '../storybook/extract';

import log, { separator } from '../lib/log';

import { addShimsToJSDOM } from '../lib/jsdom-shims';

export default async function getRuntimeSpecs(url, { verbose = false } = {}) {
  const warnings = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();

  virtualConsole.on('error', l => {
    errors.push(l);
  });
  virtualConsole.on('warn', l => {
    warnings.push(l);
  });
  virtualConsole.on('jsdomError', l => {
    errors.push(l);
  });

  if (verbose) {
    virtualConsole.sendTo(log);
  }

  const dom = await JSDOM.fromURL(url, {
    userAgent: 'Chromatic',
    runScripts: 'dangerously', // We need to execute the scripts on the page
    resources: 'usable', // We need to load scripts that are loaded via script tags
    virtualConsole,
    pretendToBeVisual: true, // Add a requestAnimationFrame polyfill, react@16 warns about it
    beforeParse(window) {
      addShimsToJSDOM(window);
    },
  });

  await new Promise((resolve, reject) => {
    dom.window.addEventListener('DOMContentLoaded', () => resolve());
    setTimeout(() => {
      reject(new Error('ContentLoadEvent timed out'));
    }, 10000);
  });

  // If the app logged something to console.error, it's probably, but not definitely an issue.
  // See https://github.com/hichroma/chromatic/issues/757
  if (
    (!log.level.match(/silent/) && errors.length) ||
    (!log.level.match(/silent|error/) && warnings.length)
  ) {
    log[errors.length ? 'error' : 'warn'](
      'The following problems were reported from your storybook:'
    );

    if (errors.length && !log.level.match(/silent/)) {
      console.log(
        errors.reduce(
          (acc, i) => stripIndents`
              ${acc}
              ${i}
              ${separator}
            `,
          stripIndents`
              Errors:
              ${separator}
            `
        )
      );
    }

    if (warnings.length && !log.level.match(/silent|error/)) {
      console.log(
        warnings.reduce(
          (acc, i) => stripIndents`
              ${acc}
              ${i}
              ${separator}
            `,
          stripIndents`
              Warnings:
              ${separator}
            `
        )
      );
    }

    console.log(stripIndents`
        This may lead to some stories not working right or getting detected by Chromatic
        We suggest you fix the errors, but we will continue anyway..
        ${separator}
      `);
  }

  try {
    const specs =
      typeof dom.window.__chromaticRuntimeSpecs__ === 'function' &&
      !dom.window.__chromaticRuntimeSpecs__.isDeprecated
        ? await dom.window.__chromaticRuntimeSpecs__()
        : await extract(dom.window);

    return specs;
  } catch (err) {
    throw err;
  } finally {
    // cleanup
    dom.window.close();
  }
}
