const path = require('path');

// What Storybook writes for Yarn Plug'n'Play and monorepo projects. Evaluated, it yields the
// package's directory rather than its name.
function getAbsolutePath(value) {
  return path.dirname(require.resolve(path.join(value, 'package.json')));
}

module.exports = { framework: getAbsolutePath('@storybook/html-vite') };
