import { StorybookConfig } from '@storybook/html-vite';
import { fileURLToPath } from 'node:url';

const config: StorybookConfig = {
  stories: process.env.SMOKE_TEST
    ? ['../test-stories/*.stories.*']
    : ['../node-src/**/*.@(mdx|stories.*)'],
  addons: [
    '@storybook/addon-docs'
  ],
  framework: { 
    name: process.env.SMOKE_TEST ? '@storybook/react-vite' : '@storybook/html-vite', 
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

    <link href="/css/global.css" rel="stylesheet" />
    <link
      href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;700&display=swap"
      rel="stylesheet"
    />

    <style>
      .code-style {
        display: inline-block;
        margin: 0;
        padding: 1rem;
        font-size: 12px;
        font-family: "Source Code Pro", monospace;
        white-space: pre-wrap;
        line-height: 1rem;
        color: #c0c4cd;
        background-color: #16242c;
      }

      .html-style {
        font-family: "Nunito Sans", sans-serif;
        font-size: 14px;
        line-height: 1;
        color: #5C6870;
        padding: 20px;
        background-color: #F6F9FC;
      }
    </style>
    `;
  },
  typescript: {
    // reactDocgen: 'react-docgen-typescript',
  },
  staticDirs: ['../static'],
};

export default config;
