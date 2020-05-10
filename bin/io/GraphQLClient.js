import HTTPClient from './HTTPClient';

export default class GraphQLClient {
  constructor({ uri, headers, retries }) {
    if (!uri) throw new Error('Option `uri` required.');

    this.uri = uri;
    this.headers = headers;
    this.retries = retries;
    this.client = new HTTPClient();
  }

  async runQuery(query, variables) {
    const response = await this.client.fetch(
      this.uri,
      {
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        method: 'post',
        body: JSON.stringify({ query, variables }),
      },
      { retries: this.retries }
    );

    const { data, errors } = await response.json();

    if (errors) {
      if (Array.isArray(errors)) {
        errors.forEach(err => {
          // eslint-disable-next-line no-param-reassign
          err.name = err.name || 'GraphQLError';
          // eslint-disable-next-line no-param-reassign
          err.at = `${err.path.join('.')} ${err.locations
            .map(l => `${l.line}:${l.column}`)
            .join(', ')}`;
        });
        throw errors.length === 1 ? errors[0] : errors;
      }
      throw errors;
    }

    return data;
  }

  // Convenience static method.
  static async runQuery(options, query, variables) {
    return new GraphQLClient(options).runQuery(query, variables);
  }
}
