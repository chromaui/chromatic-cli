import retry from 'async-retry';
import HTTPClient from './HTTPClient';

const RETRYABLE_ERROR_CODE = 'RETRYABLE_ERROR_CODE';

export default class GraphQLClient {
  constructor({ uri, ...httpClientOptions }) {
    if (!uri) throw new Error('Option `uri` required.');
    this.uri = uri;
    this.client = new HTTPClient(httpClientOptions);
    this.headers = { 'Content-Type': 'application/json' };
  }

  setAuthorization(token) {
    this.headers.Authorization = `Bearer ${token}`;
  }

  async runQuery(query, variables, { headers = {}, retries = 0 } = {}) {
    return retry(
      async (bail) => {
        const { data, errors } = await this.client
          .fetch(this.uri, {
            body: JSON.stringify({ query, variables }),
            headers: { ...this.headers, ...headers },
            method: 'post',
          })
          .then((res) => res.json())
          .catch(bail);

        if (!errors) return data;
        if (!Array.isArray(errors)) return bail(errors);

        // GraphQL typically returns a list of errors
        errors.forEach((err) => {
          // Throw an error to retry the query if it's safe to do so, otherwise bail
          if (err.extensions?.code === RETRYABLE_ERROR_CODE) throw err;

          // eslint-disable-next-line no-param-reassign
          err.name = err.name || 'GraphQLError';
          // eslint-disable-next-line no-param-reassign
          err.at = `${err.path.join('.')} ${err.locations
            .map((l) => `${l.line}:${l.column}`)
            .join(', ')}`;
        });
        return bail(errors.length === 1 ? errors[0] : errors);
      },
      { retries }
    );
  }

  // Convenience static method.
  static async runQuery(options, query, variables, runQueryOptions) {
    return new GraphQLClient(options).runQuery(query, variables, runQueryOptions);
  }
}
