import noCommitDetails from './noCommitDetails';

export default {
  title: 'CLI/Messages/Warnings',
};

export const NoCommitDetails = () => noCommitDetails('57745fe300dfee73c8c068154867c9366ad5ab99');

export const NoCommitDetailsEnvironment = () =>
  noCommitDetails('57745fe300dfee73c8c068154867c9366ad5ab99', 'CHROMATIC_SHA');
