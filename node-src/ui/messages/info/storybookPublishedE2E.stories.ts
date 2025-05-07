import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import storybookPublished from './storybookPublished';

type Build = Partial<
  Pick<
    Context['build'],
    | 'actualCaptureCount'
    | 'actualTestCount'
    | 'testCount'
    | 'changeCount'
    | 'errorCount'
    | 'componentCount'
    | 'specCount'
    | 'storybookUrl'
  >
>;

interface Properties {
  build: Build;
  options: {
    playwright: boolean;
  };
  storybookUrl: string;
}

export default {
  title: 'CLI/Messages/E2E',
  render: (args: Properties) =>
    storybookPublished(args as Pick<Context, 'build' | 'options' | 'storybookUrl'>),
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

const ctx = { options: { playwright: true } };

export const StorybookPublished: Story = {
  args: {
    ...ctx,
    build: {},
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  },
};

export const StorybookPrepared: Story = {
  args: {
    ...ctx,
    build: {
      actualCaptureCount: undefined,
      actualTestCount: undefined,
      testCount: undefined,
      changeCount: undefined,
      errorCount: undefined,
      componentCount: 5,
      specCount: 8,
      storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
    },
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  },
};

export const StorybookPreparedWithIncompleteBuild: Story = {
  args: {
    ...ctx,
    build: {
      actualCaptureCount: undefined,
      actualTestCount: undefined,
      testCount: undefined,
      changeCount: undefined,
      errorCount: undefined,
      componentCount: undefined,
      specCount: undefined,
      storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
    },
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  },
};
