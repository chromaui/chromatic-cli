module.exports = {
  stories: process.env.SMOKE_TEST ? ['../test-stories/*.stories.*'] : ['../bin-src/**/*.stories.*'],
  addons: ['@storybook/addon-viewport', '@storybook/addon-mdx-gfm'],
  features: {
    postcss: false
  },
  framework: {
    name: '@storybook/react-webpack5',
    options: {}
  },
  webpackFinal: async (config, {
    configType
  }) => {
    // eslint-disable-next-line no-param-reassign
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve.fallback,
        os: require.resolve('os-browserify/browser')
      }
    };
    return config;
  },
  docs: {
    autodocs: true
  }
};