import { buildTest, buildTests, erroredTests } from '../../components/__fixtures__/buildTests';
import buildHasErrors from './buildHasErrors';

export default {
  title: 'CLI/Messages/Errors',
};

const story =
  (build: Record<string, unknown>, isOnboarding = false) =>
  () =>
    buildHasErrors({
      build: {
        number: 42,
        status: 'BROKEN',
        errorCount: 3,
        interactionTestFailuresCount: 0,
        erroredTests: erroredTests('Icon', 3),
        webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
        app: {
          setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
        },
        ...build,
      },
      isOnboarding,
    });

export const BuildHasErrors = story({});

export const OnboardingBuildHasErrors = story({}, true);

export const BuildHasErrorsAndInteractionTestFailures = story({
  errorCount: 5,
  interactionTestFailuresCount: 2,
  erroredTests: [...erroredTests('Icon', 3), ...erroredTests('InputText', 2, true)],
});

export const BuildHasOnlyInteractionTestFailures = story({
  errorCount: 2,
  interactionTestFailuresCount: 2,
  erroredTests: erroredTests('InputText', 2, true),
});

// The CLI lists 50 tests in each category and counts the rest.
export const BuildHasErrorsWithMoreThanFiftyFailingTests = story({
  errorCount: 57,
  erroredTests: erroredTests('Icon', 57),
});

export const BuildHasErrorsAndChanges = story({
  errorCount: 6,
  interactionTestFailuresCount: 3,
  erroredTests: [...erroredTests('Icon', 3), ...erroredTests('InputText', 3, true)],
  deniedCount: 3,
  deniedTests: [...buildTests('Button', 2), buildTest('Button', 'Primary', 'Dark')],
  pendingCount: 3,
  pendingTests: buildTests('Form', 3),
  ignoredCount: 1,
  ignoredTests: buildTests('AnimatedGif', 1),
});
