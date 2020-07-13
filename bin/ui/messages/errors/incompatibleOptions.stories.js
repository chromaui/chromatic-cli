import incompatibleOptions from './incompatibleOptions';

export default {
  title: 'CLI/Messages/Errors',
};

export const IncompatibleOptions = () =>
  incompatibleOptions(['--junit-report', '--exit-once-uploaded']);
