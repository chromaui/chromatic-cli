import missingDependency from './missingDependency';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingDependency = () =>
  missingDependency({ dependencyName: '@chromatic-com/playwright', flag: 'playwright' });

export const MissingDependencyFromAction = () =>
  missingDependency({
    dependencyName: '@chromatic-com/playwright',
    flag: 'playwright',
    workingDir: '/opt/bin/chromatic',
  });
