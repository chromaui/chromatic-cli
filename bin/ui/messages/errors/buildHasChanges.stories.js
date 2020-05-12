import buildHasChanges from './buildHasChanges';

export default {
  title: 'CLI/Messages/Errors',
};

export const BuildHasChanges = () =>
  buildHasChanges({
    build: { changeCount: 42 },
    exitCode: 1,
  });
