import fetchError from './fetchError';

export default {
  title: 'CLI/Messages/Errors',
};

const err = {
  message: 'request to https://index.chromatic.com/graphql failed, reason: connect ECONNREFUSED',
  type: 'system',
  errno: 'ECONNREFUSED',
  code: 'ECONNREFUSED',
};

export const FetchError = () => fetchError({ title: 'Run a job' }, err);
