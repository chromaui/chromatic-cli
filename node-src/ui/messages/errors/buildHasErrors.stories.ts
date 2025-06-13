import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import { createBaseBuild } from '../../utils/storybook';
import buildHasErrors from './buildHasErrors';

interface Properties {
  build: Pick<Context['build'], 'errorCount' | 'interactionTestFailuresCount' | 'webUrl'>;
  exitCode: number;
}

const baseBuild = {
  ...createBaseBuild(),
  errorCount: 2,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
};

export default {
  title: 'CLI/Messages/Errors',
  render: (args: Properties) => buildHasErrors(args),
  args: {
    build: baseBuild,
    exitCode: 1,
  },
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const BuildHasErrors: Story = {
  args: {
    build: baseBuild,
    exitCode: 1,
  },
};

export const BuildHasErrorsAndInteractionTestFailure: Story = {
  args: {
    build: {
      ...baseBuild,
      interactionTestFailuresCount: 1,
    },
    exitCode: 1,
  },
};

export const BuildHasOnlyInteractionTestFailure: Story = {
  args: {
    build: {
      ...baseBuild,
      interactionTestFailuresCount: 2,
    },
    exitCode: 1,
  },
};
