import type { Meta, StoryObj } from '@storybook/html-vite';

import intro from './intro';

export default {
  title: 'CLI/Messages/Info',
  render: (args) => intro(args),
  args: {
    pkg: {
      name: 'chromatic',
      version: '4.0.3',
      description: 'Visual Testing for Storybook',
      bugs: {
        url: 'https://github.com/chromaui/chromatic-cli',
        email: 'support@chromatic.com',
      },
      docs: 'https://www.chromatic.com/docs/cli',
    },
  },
} satisfies Meta<Parameters<typeof intro>[0]>;

type Story = StoryObj<Parameters<typeof intro>[0]>;

export const Intro: Story = {
  args: {
    pkg: {
      name: 'chromatic',
      version: '4.0.3',
      description: 'Visual Testing for Storybook',
      docs: 'https://www.chromatic.com/docs/cli',
      bugs: {
        url: 'https://github.com/chromaui/chromatic-cli',
        email: 'support@chromatic.com',
      },
    },
  },
};
