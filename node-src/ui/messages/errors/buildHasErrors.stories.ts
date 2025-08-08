import buildHasErrors from './buildHasErrors';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildHasErrors = () =>
  buildHasErrors({
    build: {
      errorCount: 2,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      app: {
        setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
      },
    },
    exitCode: 1,
    isOnboarding: false,
  });

export const OnboardingBuildHasErrors = () =>
  buildHasErrors({
    build: {
      errorCount: 2,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      app: {
        setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
      },
    },
    exitCode: 1,
    isOnboarding: true,
  });

export const BuildHasErrorsAndInteractionTestFailure = () =>
  buildHasErrors({
    build: {
      errorCount: 2,
      interactionTestFailuresCount: 1,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      app: {
        setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
      },
    },
    exitCode: 1,
    isOnboarding: false,
  });

export const BuildHasOnlyInteractionTestFailure = () =>
  buildHasErrors({
    build: {
      errorCount: 2,
      interactionTestFailuresCount: 2,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      app: {
        setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
      },
    },
    exitCode: 1,
    isOnboarding: false,
  });
