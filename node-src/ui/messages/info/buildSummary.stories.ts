import { Context } from '../../../types';
import buildSummary, { SummaryLog } from './buildSummary';

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
  (build: Partial<Context['build']>, ctx: Partial<Context> = {}, log: SummaryLog = 'passed') =>
  () =>
    buildSummary(
      {
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
      } as Context,
      log
    );

export const BuildPassed = story({});

export const BuildAutoAccepted = story({
  status: 'ACCEPTED',
  autoAcceptChanges: true,
  acceptedCount: 2,
});

export const BuildCompletedViaExitZeroWithPendingChanges = story(
  { status: 'PENDING', pendingCount: 2 },
  {},
  'exitZeroOnChanges'
);

export const BuildCompletedViaExitZeroWithAcceptedChanges = story(
  { status: 'ACCEPTED', acceptedCount: 3 },
  {},
  'exitZeroOnChanges'
);

export const BuildCompletedViaExitZeroWithDeniedChanges = story(
  { status: 'DENIED', deniedCount: 1 },
  {},
  'exitZeroOnChanges'
);

export const BuildCompletedViaExitZeroWithPendingAccessibilityChanges = story(
  {
    status: 'PENDING',
    pendingCount: 2,
    features: { ...features, accessibilityTests: { enabled: true } },
  },
  {},
  'exitZeroOnChanges'
);

export const BuildPassedWithIgnoredTests = story({ ignoredCount: 3 });

export const FirstBuildPassed = story(firstBuild, { isOnboarding: true });

export const FirstBuildPassedWithIgnoredTests = story(
  { ...firstBuild, ignoredCount: 1 },
  { isOnboarding: true }
);

export const FirstBuildCompletedViaExitZeroWithPendingChanges = story(
  { ...firstBuild, status: 'PENDING', pendingCount: 1 },
  { isOnboarding: true },
  'exitZeroOnChanges'
);
