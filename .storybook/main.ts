import { StorybookConfig } from '@storybook/react-webpack5';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: process.env.SMOKE_TEST
    ? ['../test-stories/*.stories.*']
    : ['../node-src/**/*.@(mdx|stories.*)'],
  addons: ['@storybook/addon-webpack5-compiler-swc', '@storybook/addon-docs'],
  framework: { 
    name: '@storybook/react-webpack5', 
    options: {}
  },
  webpackFinal: async (config) => {
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config?.resolve?.fallback,
        os:  fileURLToPath(import.meta.resolve('os-browserify/browser')),
        path:  fileURLToPath(import.meta.resolve('path-browserify')),
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
