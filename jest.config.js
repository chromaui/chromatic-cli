module.exports = {
  transform: {
    '\\.[jt]sx?$': ['esbuild-jest'],
  },
  transformIgnorePatterns: ['node_modules/(?!(axios)/)'],
};
