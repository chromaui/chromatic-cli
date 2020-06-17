import buildHasChanges from './buildHasChanges';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildHasChanges = () =>
  buildHasChanges({
    build: {
      number: 42,
      changeCount: 2,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    },
    exitCode: 1,
  });
