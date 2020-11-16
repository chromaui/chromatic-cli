import gitNotInstalled from './gitNotInstalled';

export default {
  title: 'CLI/Messages/Errors',
};

export const GitNotInstalled = () => gitNotInstalled({ command: 'git --version' });
