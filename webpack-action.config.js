const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node14',
  entry: './action-src/register.js',
  externalsPresets: { node: true },
  output: {
    path: path.resolve(__dirname, 'action'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },
  optimization: {
    minimize: true,
  },
  node: {
    global: false,
  },
};
