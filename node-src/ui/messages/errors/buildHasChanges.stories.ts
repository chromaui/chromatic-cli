import buildHasChanges from './buildHasChanges';

export default {
  title: 'CLI/Messages/Errors',
};

const context = {
  build: {
    number: 42,
    status: 'PENDING',
    pendingCount: 2,
    ignoredCount: 1,
    features: { uiTests: true, uiReview: false, isReactNativeApp: false },
    webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    app: {
      setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
    },
  },
  exitCode: 1,
  isOnboarding: false,
};

export const BuildHasChangesNotOnboarding = () => buildHasChanges(context);

export const BuildHasChangesWithAccessibility = () =>
  buildHasChanges({
    ...context,
    build: {
      ...context.build,
      features: { ...context.build.features, accessibilityTests: { enabled: true } },
    },
  });

export const BuildHasChangesDenied = () =>
  buildHasChanges({ ...context, build: { ...context.build, status: 'DENIED', deniedCount: 1 } });

export const BuildHasChangesWithoutIgnoredTests = () =>
  buildHasChanges({ ...context, build: { ...context.build, ignoredCount: 0 } });

export const BuildHasChangesIsOnboarding = () =>
  buildHasChanges({ ...context, isOnboarding: true });
