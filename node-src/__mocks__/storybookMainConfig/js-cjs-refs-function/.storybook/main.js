// Storybook lets `refs` be a function. `require()` of this config hands the function back, where a
// parsed AST hands back nothing, so this fixture pins that we drop it either way.
module.exports = {
  refs: (config, { configType }) => ({
    design: { title: configType, url: 'https://example.chromatic.com' },
  }),
};
