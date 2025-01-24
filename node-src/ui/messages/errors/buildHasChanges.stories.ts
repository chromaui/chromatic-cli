import buildHasChanges from './buildHasChanges';

export default {
  title: 'CLI/Messages/Errors',
};

const context = {
  build: {
    number: 42,
    changeCount: 2,
    accessibilityChangeCount: 1,
    webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    app: {
      setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
    },
  },
  exitCode: 1,
  isOnboarding: false,
};

export const BuildHasChangesNotOnboarding = () => buildHasChanges(context);

export const BuildHasChangesVisualOnly = () =>
  buildHasChanges({
    ...context,
    build: { ...context.build, accessibilityChangeCount: 0 },
  });

export const BuildHasChangesAccessibilityOnly = () =>
  buildHasChanges({
    ...context,
    build: { ...context.build, changeCount: 0 },
  });

export const BuildHasChangesIsOnboarding = () =>
  buildHasChanges({ ...context, isOnboarding: true });
