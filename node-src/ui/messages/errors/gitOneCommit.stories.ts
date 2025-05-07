import gitOneCommit from './gitOneCommit';

export default {
  title: 'CLI/Messages/Errors',
};

export const GitOneCommit = () => gitOneCommit();

export const GitOneCommitAction = {
  render: () => gitOneCommit(true),
  name: 'Git One Commit GitHub Action',
};
