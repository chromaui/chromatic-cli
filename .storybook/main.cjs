module.exports = {
  stories: [
    // CLI stories
    '../bin-src/ui/**/*.stories.js',
    // Test stories
    '../**/stories/*.stories.js',
  ],
  features: {
    postcss: false,
  },
};
