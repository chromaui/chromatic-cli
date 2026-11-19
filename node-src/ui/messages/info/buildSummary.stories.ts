import { Context } from '../../../types';
import { buildTests } from '../../components/__fixtures__/buildTests';
import buildSummary from './buildSummary';

export default {
  title: 'CLI/Messages/Info',
};

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';
const features = { uiTests: true, uiReview: false, isReactNativeApp: false };
const firstBuild = {
  number: 1,
  testCount: 10,
  componentCount: 5,
  specCount: 8,
  actualCaptureCount: 20,
};

const story =
  (build: Partial<Context['build']>, ctx: Partial<Context> = {}) =>
  () =>
    buildSummary({
      options: {},
      ...ctx,
      build: {
        number: 42,
        status: 'PASSED',
        pendingCount: 0,
        acceptedCount: 0,
        deniedCount: 0,
        ignoredCount: 0,
        autoAcceptChanges: false,
        webUrl,
        features,
        app: { setupUrl },
        ...build,
      },
    } as Context);

export const BuildPassed = story({});

export const BuildAutoAccepted = story({
  status: 'ACCEPTED',
  autoAcceptChanges: true,
  acceptedCount: 2,
});

export const BuildPassedViaExitZeroWithAcceptedChanges = story({
  status: 'ACCEPTED',
  acceptedCount: 3,
});

export const BuildCompletedViaExitZeroWithPendingChanges = story({
  status: 'PENDING',
  pendingCount: 3,
  pendingTests: buildTests('Form', 3),
});

export const BuildCompletedViaExitZeroWithDeniedChanges = story({
  status: 'DENIED',
  deniedCount: 3,
  deniedTests: buildTests('Button', 3),
});

export const BuildCompletedViaExitZeroWithPendingChangesAndIgnoredTests = story({
  status: 'PENDING',
  pendingCount: 3,
  pendingTests: buildTests('Form', 3),
  ignoredCount: 1,
  ignoredTests: buildTests('AnimatedGif', 1),
});

export const BuildPassedWithIgnoredTests = story({ ignoredCount: 3 });

export const FirstBuildPassed = story(firstBuild, { isOnboarding: true });

export const FirstBuildPassedWithIgnoredTests = story(
  { ...firstBuild, ignoredCount: 1 },
  { isOnboarding: true }
);

export const FirstBuildCompletedViaExitZeroWithPendingChanges = story(
  { ...firstBuild, status: 'PENDING', pendingCount: 1 },
  { isOnboarding: true }
);
