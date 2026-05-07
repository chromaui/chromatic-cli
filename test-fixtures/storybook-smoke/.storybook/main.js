/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  stories: ['../stories/*.stories.@(js|jsx|mjs|ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../static'],
};

export default config;
