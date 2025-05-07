import type { Meta, StoryObj } from '@storybook/html-vite';

import notAddedScript from './notAddedScript';

interface Properties {
  scriptName: string;
  scriptCommand: string;
}

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => notAddedScript(args.scriptName, args.scriptCommand),
  args: {
    scriptName: 'chromatic',
    scriptCommand: 'chromatic --project-token=1234asd',
  },
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const NotAddedScript: Story = {
  args: {
    scriptName: 'chromatic',
    scriptCommand: 'chromatic --project-token=1234asd',
  },
};
