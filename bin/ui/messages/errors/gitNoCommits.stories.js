import gitNoCommits from './gitNoCommits';

export default {
  title: 'CLI/Messages/Errors',
};

export const GitNoCommits = () =>
  gitNoCommits({ command: 'git log -n 1 --format="%H,%ct,%ce,%cn"' });
