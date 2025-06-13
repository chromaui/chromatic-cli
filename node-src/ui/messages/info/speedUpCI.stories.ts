import type { Meta, StoryObj } from '@storybook/html-vite';

import speedUpCI from './speedUpCI';

interface Properties {
  provider: 'github' | 'gitlab' | 'bitbucket';
}

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => speedUpCI(args.provider),
  args: {
    provider: 'github',
  },
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const SpeedUpCI: Story = {
  args: {
    provider: 'github',
  },
};

export const SpeedUpCIGitLab: Story = {
  args: {
    provider: 'gitlab',
  },
};

export const SpeedUpCIBitbucket: Story = {
  args: {
    provider: 'bitbucket',
  },
};
