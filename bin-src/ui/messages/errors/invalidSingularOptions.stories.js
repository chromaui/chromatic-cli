import invalidSingularOptions from './invalidSingularOptions';

export default {
  title: 'CLI/Messages/Errors',
};

export const InvalidSingularOptions = () =>
  invalidSingularOptions(['--build-script-name', '--script-name']);
