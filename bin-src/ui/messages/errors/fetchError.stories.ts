import { Response } from 'node-fetch';
import fetchError from './fetchError';

export default {
  title: 'CLI/Messages/Errors',
};

export const FetchError = () =>
  fetchError(
    { title: 'Run a job' },
    {
      error: {
        name: 'FetchError',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore This seems to sometimes be required, sometimes disallowed.
        [Symbol.toStringTag]: 'FetchError',
        message:
          'request to https://index.chromatic.com/graphql failed, reason: connect ECONNREFUSED',
        type: 'system',
        errno: 'ECONNREFUSED',
        code: 'ECONNREFUSED',
      },
    }
  );

export const FetchError404 = () =>
  fetchError(
    { title: 'Run a job' },
    { statusCode: 404, response: { statusText: 'Not found' } as Response }
  );
