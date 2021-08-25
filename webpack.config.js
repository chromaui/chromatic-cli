const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node14',
  entry: './bin-src/register.js',
  externalsPresets: { node: true },
  output: {
    path: path.resolve(__dirname, 'bin'),
  },
  optimization: {
    minimize: true,
  },
  node: {
    global: false,
  },
};
