import { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../test-stories/*.stories.*'],
  addons: [
    '@storybook/addon-docs'
  ],
  framework: { 
    name: '@storybook/react-vite', 
    options: {}
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  staticDirs: ['../static'],
};

export default config;
