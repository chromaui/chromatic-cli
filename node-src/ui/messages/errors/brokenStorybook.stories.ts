import brokenStorybook from './brokenStorybook';

export default {
  title: 'CLI/Messages/Errors',
};

const failureReason = `
ReferenceError: foo is not defined
    at Module../.storybook/preview.js-generated-config-entry.js (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/main.72ad6d7a.iframe.bundle.js:1:2049)
    at __webpack_require__ (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/runtime~main.339b41cb.iframe.bundle.js:1:1301)
    at Object.0 (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/main.72ad6d7a.iframe.bundle.js:1:224364)
    at __webpack_require__ (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/runtime~main.339b41cb.iframe.bundle.js:1:1301)
    at checkDeferredModules (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/runtime~main.339b41cb.iframe.bundle.js:1:957)
    at Array.webpackJsonpCallback [as push] (https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/runtime~main.339b41cb.iframe.bundle.js:1:645)
    at https://61b0a4b8ebf0e344c2aa231c-nsoaxcirhi.capture.dev-chromatic.com/main.72ad6d7a.iframe.bundle.js:1:47
`;

const storybookUrl = 'https://61b0a4b8ebf0e344c2aa231c-wdooytetbw.dev-chromatic.com/';

export const BrokenStorybook = () => brokenStorybook({ failureReason, storybookUrl });
