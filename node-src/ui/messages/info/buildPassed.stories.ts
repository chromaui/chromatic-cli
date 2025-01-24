import buildPassed from './buildPassed';

export default {
  title: 'CLI/Messages/Info',
};

const ctx = { options: {} } as any;

export const BuildPassed = () =>
  buildPassed({
    ...ctx,
    build: {
      number: 42,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      changeCount: 0,
    },
  } as any);

export const BuildPassedWithChanges = () =>
  buildPassed({
    ...ctx,
    build: {
      number: 42,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      changeCount: 2,
      accessibilityChangeCount: 1,
    },
  } as any);

export const BuildPassedWithVisualChanges = () =>
  buildPassed({
    ...ctx,
    build: {
      number: 42,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      changeCount: 2,
    },
  } as any);

export const BuildPassedWithAccessibilityChanges = () =>
  buildPassed({
    ...ctx,
    build: {
      number: 42,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
      accessibilityChangeCount: 1,
    },
  } as any);

export const FirstBuildPassed = () =>
  buildPassed({
    ...ctx,
    isOnboarding: true,
    build: {
      number: 1,
      testCount: 10,
      componentCount: 5,
      specCount: 8,
      actualCaptureCount: 20,
      app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
    },
  } as any);
