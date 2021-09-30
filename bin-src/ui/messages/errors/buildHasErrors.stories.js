import buildHasErrors from './buildHasErrors';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildHasErrors = () =>
  buildHasErrors({
    build: {
      errorCount: 2,
      webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
    },
    exitCode: 1,
  });
