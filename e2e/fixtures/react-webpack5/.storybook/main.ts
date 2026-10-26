import type { StorybookConfig } from '@storybook/react-webpack5';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-webpack5-compiler-swc'],
  framework: '@storybook/react-webpack5',
};

export default config;
