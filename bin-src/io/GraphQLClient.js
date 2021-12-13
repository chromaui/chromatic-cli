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
        const response = await this.client.fetch(this.uri, {
          body: JSON.stringify({ query, variables }),
          headers: { ...this.headers, ...headers },
          method: 'post',
        });

        const { data, errors } = await response.json();

        if (errors) {
          if (Array.isArray(errors)) {
            errors.forEach((err) => {
              const { extensions = {} } = err;
              if (extensions.code === RETRYABLE_ERROR_CODE) {
                // throw an error to retry the query
                throw err;
              }

              // eslint-disable-next-line no-param-reassign
              err.name = err.name || 'GraphQLError';
              // eslint-disable-next-line no-param-reassign
              err.at = `${err.path.join('.')} ${err.locations
                .map((l) => `${l.line}:${l.column}`)
                .join(', ')}`;
            });
            bail(errors.length === 1 ? errors[0] : errors);
          }
          bail(errors);
        }

        return data;
      },
      { retries }
    );
  }

  // Convenience static method.
  static async runQuery(options, query, variables, runQueryOptions) {
    return new GraphQLClient(options).runQuery(query, variables, runQueryOptions);
  }
}
