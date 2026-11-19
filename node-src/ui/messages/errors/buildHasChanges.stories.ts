import { buildTest, buildTests } from '../../components/__fixtures__/buildTests';
import buildHasChanges from './buildHasChanges';

export default {
  title: 'CLI/Messages/Errors',
};

const context = {
  build: {
    number: 42,
    status: 'PENDING',
    pendingCount: 3,
    pendingTests: buildTests('Form', 3),
    ignoredCount: 1,
    ignoredTests: buildTests('AnimatedGif', 1),
    webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    app: {
      setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57',
    },
  },
  exitCode: 1,
  isOnboarding: false,
};

const story =
  (build: Record<string, unknown>, isOnboarding = false) =>
  () =>
    buildHasChanges({ ...context, isOnboarding, build: { ...context.build, ...build } });

export const BuildHasChangesNotOnboarding = story({});

export const BuildHasChangesWithoutIgnoredTests = story({ ignoredCount: 0, ignoredTests: [] });

export const BuildHasChangesWithModes = story({
  pendingTests: [
    buildTest('Form', 'Playground'),
    buildTest('Form', 'Playground', 'Dark'),
    buildTest('Form', 'Playground', 'Mobile'),
  ],
});

// The CLI lists 50 tests in each category and counts the rest.
export const BuildHasChangesWithMoreThanFiftyChanges = story({
  pendingCount: 57,
  pendingTests: buildTests('Form', 57),
});

export const BuildHasChangesDenied = story({
  status: 'DENIED',
  pendingCount: 0,
  pendingTests: [],
  deniedCount: 3,
  deniedTests: buildTests('Button', 3),
});

export const BuildHasChangesDeniedAndPending = story({
  status: 'DENIED',
  deniedCount: 3,
  deniedTests: buildTests('Button', 3),
});

export const BuildHasChangesDeniedWithMoreThanFiftyDeniedTests = story({
  status: 'DENIED',
  pendingCount: 0,
  pendingTests: [],
  deniedCount: 57,
  deniedTests: buildTests('Button', 57),
});

// A reviewer accepted the changes while the CLI waited for the build.
export const BuildHasChangesAccepted = story({
  status: 'ACCEPTED',
  pendingCount: 0,
  pendingTests: [],
  acceptedCount: 2,
  ignoredCount: 0,
  ignoredTests: [],
});

export const BuildHasChangesIsOnboarding = story({}, true);
