import { buildTest, buildTests } from '../../components/__fixtures__/buildTests';
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
        renderFailureCount: 3,
        renderFailureTests: buildTests('Icon', 3),
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
  interactionFailureCount: 2,
  interactionFailureTests: buildTests('InputText', 2),
});

export const BuildHasOnlyInteractionTestFailures = story({
  errorCount: 2,
  renderFailureCount: 0,
  renderFailureTests: [],
  interactionFailureCount: 2,
  interactionFailureTests: buildTests('InputText', 2),
});

// The index returns at most 50 tests per section; the CLI counts the rest.
export const BuildHasErrorsWithMoreThanFiftyFailingTests = story({
  errorCount: 57,
  renderFailureCount: 57,
  renderFailureTests: buildTests('Icon', 50),
});

export const BuildHasErrorsAndChanges = story({
  errorCount: 6,
  interactionFailureCount: 3,
  interactionFailureTests: buildTests('InputText', 3),
  deniedCount: 3,
  deniedTests: [...buildTests('Button', 2), buildTest('Button', 'Primary', 'Dark')],
  pendingCount: 3,
  pendingTests: buildTests('Form', 3),
  ignoredCount: 1,
  ignoredTests: buildTests('AnimatedGif', 1),
});

// The list query failed, for example against an index without the change: counts only.
export const BuildHasErrorsWithoutLists = story({
  renderFailureCount: undefined,
  renderFailureTests: undefined,
  pendingCount: 2,
});
