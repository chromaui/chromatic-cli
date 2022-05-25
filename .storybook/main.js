module.exports = {
  stories: process.env.SMOKE_TEST ? ['../test-stories/*.stories.*'] : ['../bin-src/**/*.stories.*'],
  features: {
    postcss: false,
  },
  core: {
    builder: 'webpack5',
  },
  webpackFinal: async (config, { configType }) => {
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
