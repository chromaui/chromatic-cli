import buildPassed from './buildPassed';

export default {
  title: 'CLI/Messages/Info',
};

export const BuildPassed = () =>
  buildPassed({
    build: {
      number: 42,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    },
  });

export const FirstBuildPassed = () =>
  buildPassed({
    isOnboarding: true,
    build: {
      number: 1,
      testCount: 10,
      componentCount: 5,
      specCount: 8,
      actualCaptureCount: 20,
      app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
    },
  });
