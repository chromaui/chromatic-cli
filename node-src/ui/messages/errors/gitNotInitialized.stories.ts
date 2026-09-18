import gitNotInitialized from './gitNotInitialized';

export default {
  title: 'CLI/Messages/Errors',
};

export const GitNotInitialized = () => gitNotInitialized({ command: 'git --version' });
