import type { Meta, StoryObj } from '@storybook/html-vite';

import forceRebuildHint from './forceRebuildHint';

export default {
  title: 'CLI/Messages/Info',
  render: () => forceRebuildHint(),
} satisfies Meta<void>;

type Story = StoryObj;

export const ForceRebuildHint: Story = {};
