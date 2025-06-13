import type { Meta, StoryObj } from '@storybook/html-vite';

import { Context } from '../../../types';
import { createBaseBuild, createBaseContext, createBaseOptions } from '../../utils/storybook';
import buildPassed from './buildPassed';

interface Properties {
  build: Pick<
    Context['build'],
    | 'number'
    | 'webUrl'
    | 'testCount'
    | 'componentCount'
    | 'specCount'
    | 'actualCaptureCount'
    | 'app'
    | 'changeCount'
    | 'accessibilityChangeCount'
    | 'id'
    | 'status'
    | 'storybookUrl'
    | 'inheritedCaptureCount'
    | 'actualTestCount'
    | 'errorCount'
    | 'interactionTestFailuresCount'
    | 'autoAcceptChanges'
  >;
  options: Pick<
    Context['options'],
    | 'playwright'
    | 'projectToken'
    | 'onlyChanged'
    | 'onlyStoryFiles'
    | 'onlyStoryNames'
    | 'untraced'
    | 'externals'
    | 'traceChanged'
    | 'list'
    | 'fromCI'
    | 'inAction'
    | 'skip'
    | 'dryRun'
    | 'forceRebuild'
    | 'debug'
    | 'fileHashing'
    | 'interactive'
    | 'zip'
    | 'autoAcceptChanges'
    | 'exitZeroOnChanges'
    | 'exitOnceUploaded'
    | 'isLocalBuild'
    | 'ignoreLastBuildOnBranch'
    | 'preserveMissingSpecs'
    | 'originalArgv'
    | 'buildScriptName'
    | 'buildCommand'
    | 'outputDir'
    | 'storybookBuildDir'
    | 'storybookBaseDir'
    | 'storybookConfigDir'
    | 'storybookLogFile'
    | 'ownerName'
    | 'repositorySlug'
    | 'branchName'
    | 'patchHeadRef'
    | 'patchBaseRef'
    | 'skipUpdateCheck'
    | 'cypress'
    | 'allowConsoleErrors'
  >;
  isOnboarding?: boolean;
}

const baseContext = createBaseContext({
  options: { ...createBaseOptions(), playwright: true },
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
});

export default {
  title: 'CLI/Messages/E2E',
  render: (args: Properties) =>
    buildPassed(args as Pick<Context, 'build' | 'options' | 'isOnboarding'>),
  args: baseContext,
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const BuildPassedE2E: Story = {
  args: baseContext,
};

export const BuildPassedE2EWithChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      changeCount: 2,
      accessibilityChangeCount: 1,
    },
  },
};

export const BuildPassedE2EWithVisualChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      changeCount: 2,
    },
  },
};

export const BuildPassedE2EWithAccessibilityChanges: Story = {
  args: {
    ...baseContext,
    build: {
      ...baseContext.build,
      accessibilityChangeCount: 1,
    },
  },
};

export const FirstBuildPassedE2E: Story = {
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
