import missingDependency from './missingDependency';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingDependency = () =>
  missingDependency({ dependencyName: '@chromatic-com/playwright', flag: 'playwright' });
