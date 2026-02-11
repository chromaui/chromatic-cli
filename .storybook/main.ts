import { StorybookConfig } from '@storybook/html-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: ['../node-src/**/*.@(mdx|stories.*)'],
  addons: [
    '@storybook/addon-docs'
  ],
  framework: { 
    name: '@storybook/html-vite', 
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
  previewHead: (head) => {
    return head + `
    <link href="./css/global.css" rel="stylesheet" />

    <script>
      window.process = {
        env: {
          CI: '1',
          NODE_ENV: 'production',
          STORYBOOK_INVOKED_BY: 'chromatic',
          TERM: 'xterm-256color',
        },
        platform: '${process.platform}',
      };
    </script>
    `;
  },
  typescript: {
  },
  staticDirs: ['../static'],
};

export default config;
