const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node14',
  entry: './bin-src/register.js',
  externalsPresets: { node: true },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'main.cjs',
  },
  module: {
    rules: [
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false // disable the behaviour
        }
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  experiments: {topLevelAwait: true},
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
    fullySpecified: false,
  },
  optimization: {
    minimize: true,
  },
  node: {
    global: false,
  },
};
