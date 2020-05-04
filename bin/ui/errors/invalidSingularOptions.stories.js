import invalidSingularOptions from './invalidSingularOptions';

export default {
  title: 'CLI/Errors',
};

export const InvalidSingularOptions = () =>
  invalidSingularOptions(['--build-script-name', '--script-name']);
