import retry from 'async-retry';
import { z } from 'zod';

import { InitialContext } from '..';
import HTTPClient, { HTTPClientError, HTTPClientOptions } from './httpClient';

const RETRYABLE_ERROR_CODE = 'RETRYABLE_ERROR_CODE';

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions: {
    code: string;
    exception?: { stacktrace?: string[] };
  };
}

const errorLocation = (error: GraphQLError) =>
  `${error.path?.join('.') || ''} ${error.locations?.map((l) => `${l.line}:${l.column}`).join(', ') || ''}`;

const validationErrorResponse = z.object({
  // Execution responses may contain partial data. They must never become compatibility retries.
  data: z.never().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        path: z.never().optional(),
        locations: z.array(z.object({ line: z.number(), column: z.number() })).optional(),
        extensions: z.object({ code: z.literal('GRAPHQL_VALIDATION_FAILED') }),
      })
    )
    .min(1),
});

/**
 * Interact with a GraphQL server using fetch and retries.
 */
export default class GraphQLClient {
  endpoint: string;
  headers: Record<string, string>;
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
            { retries, noLogErrorBody: true }
          )
          .then((result) => result.json() as any)
          .catch((error) => this.readValidationError(error))
          .catch(bail);

        if (!errors) return data;
        if (!Array.isArray(errors)) return bail(errors);

        // GraphQL typically returns a list of errors
        this.client.log.debug({ errors }, 'GraphQL errors');
        for (const err of errors) {
          // Throw an error to retry the query if it's safe to do so, otherwise bail
          if (err.extensions && err.extensions.code === RETRYABLE_ERROR_CODE) throw err;

          err.name = err.name || 'GraphQLError';
          err.at = errorLocation(err);
        }
        return bail(errors.length === 1 ? errors[0] : errors);
      },
      { retries }
    );
  }

  private async readValidationError(error: unknown) {
    if (!(error instanceof HTTPClientError)) throw error;
    const body = await error.response.text().catch(() => {
      throw error;
    });
    this.client.log.debug(error.message);
    this.client.log.debug(body);
    if (error.response.status !== 400) throw error;

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw error;
    }
    const result = validationErrorResponse.safeParse(parsed);
    if (!result.success) throw error;
    return result.data;
  }
}
