import gitTimeoutInMilliseconds from './gitTimeoutInMilliseconds';

export default {
  title: 'CLI/Messages/Warnings',
};

export const GitTimeoutInMilliseconds = () => gitTimeoutInMilliseconds({ gitTimeout: 60_000 });
