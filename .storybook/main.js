module.exports = {
  stories: process.env.SMOKE_TEST ? ['../test-stories/*.stories.*'] : ['../bin-src/**/*.stories.*'],
  features: {
    postcss: false,
  },
  core: {
    builder: 'webpack5',
  },
  staticDirs: ['../static'],
  webpackFinal: async (config, { configType }) => {
    // eslint-disable-next-line no-param-reassign
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve.fallback,
        os: false,
      },
    };

    return config;
  },
};
