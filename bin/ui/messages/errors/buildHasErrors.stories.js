import buildHasErrors from './buildHasErrors';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildHasErrors = () =>
  buildHasErrors({
    build: { errorCount: 2 },
    exitCode: 1,
  });
