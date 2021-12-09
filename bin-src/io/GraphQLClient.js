import HTTPClient, { HTTPClientError } from './HTTPClient';

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

  throwErrors(errors) {
    this.client.log.debug({ errors }, 'GraphQL errors');
    if (Array.isArray(errors)) {
      errors.forEach((err) => {
        // eslint-disable-next-line no-param-reassign
        err.name = err.name || 'GraphQLError';
        if (err.path) {
          // eslint-disable-next-line no-param-reassign
          err.at = `${err.path.join('.')} ${err.locations
            .map((l) => `${l.line}:${l.column}`)
            .join(', ')}`;
        }
      });
      throw errors.length === 1 ? errors[0] : errors;
    }
    throw errors;
  }

  async runQuery(query, variables, headers) {
    try {
      const response = await this.client.fetch(
        this.uri,
        {
          body: JSON.stringify({ query, variables }),
          headers: { ...this.headers, ...headers },
          method: 'post',
        },
        { noLogErrorBody: true }
      );

      const { data, errors } = await response.json();
      return errors ? this.throwErrors(errors) : data;
    } catch (err) {
      if (!(err instanceof HTTPClientError)) throw err;
      const { errors } = await err.response.json().catch(() => ({ errors: err }));
      return this.throwErrors(errors);
    }
  }

  // Convenience static method.
  static async runQuery(options, query, variables) {
    return new GraphQLClient(options).runQuery(query, variables);
  }
}
