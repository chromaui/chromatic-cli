import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import { createBaseBuild, createBaseContext, createBaseOptions } from '../../utils/storybook';
import storybookPublished from './storybookPublished';

interface Properties {
  build: Pick<
    Context['build'],
    | 'id'
    | 'status'
    | 'storybookUrl'
    | 'number'
    | 'webUrl'
    | 'inheritedCaptureCount'
    | 'actualCaptureCount'
    | 'actualTestCount'
    | 'specCount'
    | 'componentCount'
    | 'testCount'
    | 'changeCount'
    | 'errorCount'
    | 'accessibilityChangeCount'
    | 'interactionTestFailuresCount'
    | 'autoAcceptChanges'
    | 'app'
  >;
  options: Context['options'];
}

const baseContext = createBaseContext({
  options: {
    ...createBaseOptions(),
    storybookBuildDir: './storybook-static',
  },
  build: {
    ...createBaseBuild(),
    id: 'test-id',
    status: 'PASSED',
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  },
});

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => storybookPublished(args),
  args: baseContext,
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const StorybookPublished: Story = {
  args: baseContext,
};

export const StorybookPrepared: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      status: 'PREPARED',
    },
  },
};

export const StorybookPreparedWithIncompleteBuild: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      status: 'PREPARED',
      storybookUrl: '',
    },
  },
};
