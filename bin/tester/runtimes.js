/* eslint-disable no-useless-catch, no-console, no-underscore-dangle */
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import dedent from 'ts-dedent';
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

  const resourceLoader = new ResourceLoader({
    userAgent: 'Chromatic',
  });
  const dom = await JSDOM.fromURL(url, {
    userAgent: 'Chromatic',
    runScripts: 'dangerously', // We need to execute the scripts on the page
    virtualConsole,
    resources: resourceLoader,
    pretendToBeVisual: true, // Add a requestAnimationFrame polyfill, react@16 warns about it
    beforeParse(window) {
      addShimsToJSDOM(window);
    },
  });

  await new Promise((resolve, reject) => {
    dom.window.addEventListener('DOMContentLoaded', () => resolve());
    setTimeout(() => {
      reject(new Error('ContentLoadEvent timed out'));
    }, 60000);
  });

  const hasErrors = !!errors.length;
  const hasVisibleErrors = hasErrors;
  const hasVisibileWarnings = !!warnings.length && log.level.match(/verbose/);

  if (hasVisibleErrors || hasVisibileWarnings) {
    log[errors.length ? 'error' : 'warn'](
      'The following problems were reported from your storybook:'
    );

    if (hasVisibleErrors) {
      console.log(
        errors.reduce(
          (acc, i) => dedent`
              ${acc}
              ${i.stack || i}
              ${separator}
            `,
          dedent`
              Errors:
              ${separator}
            `
        )
      );
    }

    if (hasVisibileWarnings) {
      console.log(
        warnings.reduce(
          (acc, i) => dedent`
              ${acc}
              ${i.stack || i}
              ${separator}
            `,
          dedent`
              Warnings:
              ${separator}
            `
        )
      );
    }

    if (hasErrors) {
      console.log(dedent`
          This very likely caused some stories not working right or getting detected by Chromatic
          Please fix the errors, we can't continue..
          ${separator}
        `);
      throw new Error('Errors detected in storybook runtime');
    } else if (warnings.length && log.level.match(/verbose/)) {
      console.log(dedent`
          This may lead to some stories not working right or getting detected by Chromatic
          We suggest you fix the warnings, but we will continue anyway..
          ${separator}
        `);
    }
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
