import invalidProjectToken from './invalidProjectToken';

export default {
  title: 'CLI/Errors',
};

export const InvalidProjectToken = () => invalidProjectToken({ projectToken: 'asdf123' });
