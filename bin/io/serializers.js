import pino from 'pino';

export function responseSerializer({ status, statusText, headers, url, _raw }) {
  return {
    status,
    statusText,
    headers,
    url,
    _raw: _raw.toString(),
  };
}

export const errSerializer = err => {
  // We *don't* want to log the envPairs key -- this is added by node and includes
  // all of our environment variables! See https://github.com/chromaui/chromatic/issues/1993
  const { envPairs, ...serializedErr } = pino.stdSerializers.err(err);
  return {
    ...serializedErr,
    // Serialize the response part of err with the response serializer
    ...(err.response && { response: responseSerializer(err.response) }),
  };
};

const serializers = {
  ...pino.stdSerializers,
  err: errSerializer,
};

export { serializers as default };
