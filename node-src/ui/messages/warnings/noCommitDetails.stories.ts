import noCommitDetails from './noCommitDetails';

export default {
  title: 'CLI/Messages/Warnings',
};

export const NoCommitDetails = () =>
  noCommitDetails({
    sha: '57745fe300dfee73c8c068154867c9366ad5ab99',
  });

export const NoCommitDetailsEnvironment = () =>
  noCommitDetails({
    sha: '57745fe300dfee73c8c068154867c9366ad5ab99',
    env: 'CHROMATIC_SHA',
  });

export const NoCommitDetailsBranch = () =>
  noCommitDetails({
    ref: 'feature/example',
    sha: '57745fe300dfee73c8c068154867c9366ad5ab99',
    env: 'GITHUB_HEAD_REF',
  });
