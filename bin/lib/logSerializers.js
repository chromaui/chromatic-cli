function responseSerializer({ status, statusText, headers, url, _raw }) {
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
function stripEnvPairs(err) {
  const { envPairs, options: { envPairs: x, ...options } = {}, ...sanitizedErr } = err;
  return { sanitizedErr, ...(err.options && { options }) };
}

export const errorSerializer = err => ({
  ...stripEnvPairs(err),
  // Serialize the response part of err with the response serializer
  ...(err.response && { response: responseSerializer(err.response) }),
});
