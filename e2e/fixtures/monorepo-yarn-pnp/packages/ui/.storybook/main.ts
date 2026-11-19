import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/react-vite';

// What `storybook init` writes for Yarn Plug'n'Play projects.
function getAbsolutePath(value: string): any {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: getAbsolutePath('@storybook/react-vite'),
};

export default config;
