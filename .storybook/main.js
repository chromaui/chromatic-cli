module.exports = {
  stories: process.env.SMOKE_TEST
    ? ['../test-stories/*.stories.*']
    : ['../node-src/**/*.stories.*'],
  addons: ['@storybook/addon-viewport'],
  features: {
    postcss: false,
  },
  framework: '@storybook/react',
  core: {
    builder: 'webpack5',
  },
  webpackFinal: async (config) => {
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve.fallback,
        os: require.resolve('os-browserify/browser'),
      },
    };

    return config;
  },
};
