const path = require('path');
const { BannerPlugin } = require('webpack');
const LicensePlugin = require('webpack-license-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  target: 'node16',
  entry: './bin-src/register.js',
  externalsPresets: { node: true },
  // devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'main.cjs',
    clean: true,
    hashFunction: 'xxhash64',
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
  plugins: [
    new BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
    }),
    new LicensePlugin({
      licenseOverrides: { 'json-schema@0.2.3': 'AFL-2.1' },
    }),
  ],
  optimization: {
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          format: {
            comments: false,
          },
        },
      }),
    ],
  },
  node: {
    global: false,
  },
};
