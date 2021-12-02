import dependentOption from './dependentOption';

export default {
  title: 'CLI/Messages/Errors',
};

export const DependentOption = () => dependentOption('--ignore-changed', '--only-changed');
