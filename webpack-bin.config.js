const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  target: 'node12',
  entry: './bin-src/register.js',
  externalsPresets: { node: true },
  // devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'main.cjs',
  },
  module: {
    rules: [
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false, // disable the behaviour
        },
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  experiments: { topLevelAwait: true },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    fullySpecified: false,
  },
  plugins: [new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true })],
  optimization: {
    minimize: true,
  },
  node: {
    global: false,
  },
};
