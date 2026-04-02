module.exports = {
  stories: ['../*.stories.js'],

  framework: {
    name: '@storybook/react-webpack5',
    options: {}
  },

  typescript: {
    reactDocgen: 'react-docgen-typescript'
  },

  addons: ['@storybook/addon-webpack5-compiler-swc']
};
