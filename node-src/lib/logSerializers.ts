import { Response } from 'node-fetch';

function responseSerializer({ status, statusText, headers, url, _raw }: Response & { _raw?: any }) {
  return {
    status,
    statusText,
    headers,
    url,
    ...(_raw && { _raw: _raw.toString() }),
  };
}

// We *don't* want to log the envPairs key -- this is added by node and includes
// all of our environment variables! See https://github.com/chromaui/chromatic/issues/1993
// Note it is added to both err.envPairs *and* err.options.envPairs :facepalm:
function stripEnvironmentPairs(err: any) {
  // @ts-expect-error Ignore the _ property
  const { envPairs, options: { envPairs: _, ...options } = {}, ...sanitizedError } = err;
  return { sanitizedErr: sanitizedError, ...(err.options && { options }) };
}

export const errorSerializer = (err: any) => ({
  ...stripEnvironmentPairs(err),
  // Serialize the response part of err with the response serializer
  ...(err.response && { response: responseSerializer(err.response) }),
});
