/* eslint-env browser */
import deprecate from 'util-deprecate';
import dedent from 'ts-dedent';

import isChromatic from './isChromatic';

deprecate(
  () => {},
  dedent`
    You're importing 'storybook-chromatic' in your config.js
    This is no longer necessary!

    If you're importing { isChromatic } in your stories, please change that to:
    "import isChromatic from "storybook-chromatic/isChromatic";"
  `
)();

export { isChromatic };
