const path = require('path');

module.exports = {
  entry: './bin-src/main.js',
  externalsPresets: {node:true},
  output: {
    path: path.resolve(__dirname, 'bin'),
  },
};