import type { Meta, StoryObj } from '@storybook/html-vite';

import customGitHubAction from './customGitHubAction';

export default {
  title: 'CLI/Messages/Info',
  render: () => customGitHubAction(),
} satisfies Meta<void>;

type Story = StoryObj;

export const CustomGitHubAction: Story = {};
