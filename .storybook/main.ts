import { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: process.env.SMOKE_TEST
    ? ['../test-stories/*.stories.*']
    : ['../node-src/**/*.@(mdx|stories.*)'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  viteFinal: async (config) => {
    config.define = {
      ...config.define,
      'process.platform': "'cool'",
    };
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        os: require.resolve('os-browserify/browser'),
        // fix for "error: process is not defined"
        process: require.resolve('process/browser'),
      },
    };
    return config;
  },
};

export default config;
