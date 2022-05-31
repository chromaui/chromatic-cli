module.exports = {
  stories: process.env.SMOKE_TEST ? ['../test-stories/*.stories.*'] : ['../bin-src/**/*.stories.*'],
  features: {
    postcss: false,
  },
};
