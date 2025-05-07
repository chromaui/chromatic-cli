import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import { createBaseBuild, createBaseContext, createBaseOptions } from '../../utils/storybook';
import turboSnapEnabled from './turboSnapEnabled';

type Properties = Pick<Context, 'build' | 'options' | 'skipSnapshots'>;

const baseContext = createBaseContext({
  options: createBaseOptions(),
  build: {
    ...createBaseBuild(),
    inheritedCaptureCount: 42,
    actualCaptureCount: 12,
  },
  skipSnapshots: false,
});

const meta = {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => turboSnapEnabled(args),
  args: baseContext,
} satisfies Meta<Properties>;

export default meta;

type Story = StoryObj<Properties>;

export const TurboSnapEnabled: Story = {
  args: baseContext,
};

export const TurboSnapEnabledInteractive: Story = {
  args: {
    ...baseContext,
    options: {
      ...baseContext.options,
      interactive: true,
    },
  },
};

export const TurboSnapEnabledWithSkipSnapshots: Story = {
  args: {
    ...baseContext,
    skipSnapshots: true,
  },
};
