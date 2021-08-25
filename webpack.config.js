const path = require('path');

module.exports = {
  entry: './bin-src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
};