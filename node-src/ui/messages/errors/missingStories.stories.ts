import type { Meta, StoryObj } from '@storybook/html-vite';

import { createBaseContext, createBaseOptions } from '../../utils/storybook';
import missingStories from './missingStories';

const baseContext = createBaseContext({
  options: {
    ...createBaseOptions(),
    buildScriptName: 'build:storybook',
  },
  buildLogFile: '/path/to/project/build-storybook.log',
});

export default {
  title: 'CLI/Messages/Errors',
  render: (args: Parameters<typeof missingStories>[0]) => missingStories(args),
  args: baseContext,
} satisfies Meta<Parameters<typeof missingStories>[0]>;

type Story = StoryObj<Parameters<typeof missingStories>[0]>;

export const MissingStories: Story = {
  args: baseContext,
};
