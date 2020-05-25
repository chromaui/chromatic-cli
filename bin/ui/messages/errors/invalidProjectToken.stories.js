import invalidProjectToken from './invalidProjectToken';

export default {
  title: 'CLI/Messages/Errors',
};

export const InvalidProjectToken = () => invalidProjectToken({ projectToken: 'asdf123' });
