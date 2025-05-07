import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import { createBaseBuild, createBaseContext, createBaseOptions } from '../../utils/storybook';
import buildPassed from './buildPassed';

interface Properties {
  build: Pick<
    Context['build'],
    | 'id'
    | 'number'
    | 'status'
    | 'webUrl'
    | 'storybookUrl'
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
  isOnboarding: boolean;
  storybookUrl?: string;
}

const baseContext = createBaseContext({
  options: createBaseOptions(),
  build: {
    ...createBaseBuild(),
    number: 1,
    webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=1',
    testCount: 10,
    componentCount: 5,
    specCount: 8,
    actualCaptureCount: 20,
    app: {
      setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
      manageUrl: 'https://www.chromatic.com/manage?appId=59c59bd0183bd100364e1d57',
    },
  },
  isOnboarding: false,
});

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => buildPassed(args),
  args: baseContext,
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const BuildPassed: Story = {
  args: baseContext,
};

export const BuildPassedWithChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      changeCount: 2,
      accessibilityChangeCount: 1,
    },
  },
};

export const BuildPassedWithVisualChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      changeCount: 2,
    },
  },
};

export const BuildPassedWithAccessibilityChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      accessibilityChangeCount: 1,
    },
  },
};

export const FirstBuildPassed: Story = {
  args: {
    ...baseContext,
    isOnboarding: true,
    build: {
      ...baseContext.build,
      number: 1,
      testCount: 10,
      componentCount: 5,
      specCount: 8,
      actualCaptureCount: 20,
    },
  },
};
