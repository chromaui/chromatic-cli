import { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: ['../test-stories/*.stories.*'],
  addons: [
    '@storybook/addon-docs'
  ],
  framework: { 
    name: '@storybook/react-vite', 
    options: {}
  },
  viteFinal: async (config) => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        os: fileURLToPath(import.meta.resolve('os-browserify/browser')),
      },
    };
    return config;
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  staticDirs: ['../static'],
};

export default config;
