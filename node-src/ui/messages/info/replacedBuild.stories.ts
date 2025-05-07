import type { Meta, StoryObj } from '@storybook/html-vite';

import { createBaseBuild } from '../../utils/storybook';
import replacedBuild from './replacedBuild';

const baseReplacedBuild = {
  ...createBaseBuild(),
  number: 4,
  commit: 'ae376da36bf2a5846e5543de97a8f0c7abce7dd9',
  branch: 'main',
  committedAt: 1_715_136_000,
};

const baseReplacementBuild = {
  ...createBaseBuild(),
  number: 2,
  commit: 'f70da5a947035877c85eee5cb6588aaf4ef2c481',
  branch: 'main',
  committedAt: 1_715_136_000,
};

export default {
  title: 'CLI/Messages/Info',
  render: (args: Parameters<typeof replacedBuild>[0]) => replacedBuild(args),
  args: {
    replacedBuild: baseReplacedBuild,
    replacementBuild: baseReplacementBuild,
  },
} satisfies Meta<Parameters<typeof replacedBuild>[0]>;

type Story = StoryObj<Parameters<typeof replacedBuild>[0]>;

export const ReplacedBuild: Story = {};
