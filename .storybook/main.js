module.exports = {
  stories: process.env.SMOKE_TEST
    ? ['../test-stories/*.stories.js']
    : ['../bin-src/**/*.stories.js'],
  features: {
    postcss: false,
  },
};
