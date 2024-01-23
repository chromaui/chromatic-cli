import retry from 'async-retry';

import { InitialContext } from '..';
import HTTPClient, { HTTPClientOptions } from './HTTPClient';

const RETRYABLE_ERROR_CODE = 'RETRYABLE_ERROR_CODE';

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  extensions: {
    code: string;
    exception?: { stacktrace?: string[] };
  };
}

export default class GraphQLClient {
  endpoint: string;
  headers: HTTPClientOptions['headers'];
  client: HTTPClient;

  constructor(ctx: InitialContext, endpoint: string, httpClientOptions: HTTPClientOptions) {
    if (!endpoint) throw new Error('Option `endpoint` required.');
    this.endpoint = endpoint;
    this.client = new HTTPClient(ctx, httpClientOptions);
    this.headers = { 'Content-Type': 'application/json' };
  }

  setAuthorization(token: string) {
    this.headers.Authorization = `Bearer ${token}`;
  }

  async runQuery<T>(
    query: string,
    variables: Record<string, any>,
    { endpoint = this.endpoint, headers = {}, retries = 2 } = {}
  ): Promise<T> {
    return retry(
      async (bail) => {
        const { data, errors } = await this.client
          .fetch(
            endpoint,
            {
              body: JSON.stringify({ query, variables }),
              headers: { ...this.headers, ...headers },
              method: 'post',
            },
            { retries }
          )
          .then((res) => res.json() as any)
          .catch(bail);

        if (!errors) return data;
        if (!Array.isArray(errors)) return bail(errors);

        // GraphQL typically returns a list of errors
        this.client.log.debug({ errors }, 'GraphQL errors');
        errors.forEach((err) => {
          // Throw an error to retry the query if it's safe to do so, otherwise bail
          if (err.extensions && err.extensions.code === RETRYABLE_ERROR_CODE) throw err;

          err.name = err.name || 'GraphQLError';
          err.at = `${err.path.join('.')} ${err.locations
            .map((l) => `${l.line}:${l.column}`)
            .join(', ')}`;
        });
        return bail(errors.length === 1 ? errors[0] : errors);
      },
      { retries }
    );
  }
}
