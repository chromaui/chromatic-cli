import nodeFetch, { Response } from 'node-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import getEnvironment from '../lib/getEnvironment';
import { runUsageQuery } from '../lib/runUsageQuery';
import TestLogger from '../lib/testLogger';
import GraphQLClient from './graphqlClient';
import { HTTPClientError } from './httpClient';

vi.mock('node-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node-fetch')>()),
  default: vi.fn(),
}));

const createClient = () =>
  new GraphQLClient(
    {
      argv: [],
      flags: {},
      help: {},
      pkg: {
        name: 'chromatic',
        version: '1',
        description: '',
        bugs: { url: '', email: '' },
        docs: '',
      },
      extraOptions: {},
      packagePath: '/project/package.json',
      packageJson: {},
      env: getEnvironment(),
      log: new TestLogger(),
      sessionId: 'test',
    },
    'https://example.com/graphql',
    {}
  );

const usageQuery = (includeUsage: boolean) =>
  includeUsage ? 'query {\n  usageStatus { dataStatus }\n}' : 'query { id }';

describe('GraphQL validation errors', () => {
  it('preserves errors without an execution path for safe compatibility fallback', async () => {
    const client = createClient();
    const fetch = vi.spyOn(client.client, 'fetch');
    fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'Cannot query field "usageStatus" on type "AnnouncedBuild".',
                locations: [{ line: 3, column: 1 }],
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
              },
            ],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'build' } })));

    const result = await runUsageQuery(
      client,
      (includeUsage) => (includeUsage ? 'current' : 'legacy'),
      {},
      { retries: 0 }
    );
    expect(result).toEqual({ id: 'build' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves unrelated errors with no locations instead of retrying the mutation', async () => {
    const client = createClient();
    const fetch = vi.spyOn(client.client, 'fetch');
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              message: 'Usage budget exceeded',
              extensions: { code: 'BUDGET_EXCEEDED' },
            },
          ],
        })
      )
    );
    await expect(runUsageQuery(client, () => 'mutation', {}, { retries: 0 })).rejects.toMatchObject(
      {
        message: 'Usage budget exceeded',
        name: 'GraphQLError',
      }
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('recognizes production HTTP 400 validation responses only at a new advisory field', async () => {
    const client = createClient();
    const fetch = vi.spyOn(client.client, 'fetch');
    fetch
      .mockRejectedValueOnce(
        new HTTPClientError(
          new Response(
            JSON.stringify({
              errors: [
                {
                  message: "Your query doesn't match the schema. Try double-checking it!",
                  locations: [{ line: 2, column: 3 }],
                  extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
                },
              ],
            }),
            { status: 400 }
          )
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'build' } })));
    const result = await runUsageQuery(
      client,
      (includeUsage) =>
        includeUsage ? 'query {\n  usageStatus { dataStatus }\n}' : 'query { id }',
      {},
      { retries: 0 }
    );
    expect(result).toEqual({ id: 'build' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ noLogErrorBody: true })
    );
  });

  it.each([
    { status: 400, code: 'FORBIDDEN', line: 2, extra: {} },
    { status: 400, code: 'BUDGET_EXCEEDED', line: 2, extra: {} },
    { status: 500, code: 'GRAPHQL_VALIDATION_FAILED', line: 2, extra: {} },
    { status: 400, code: 'GRAPHQL_VALIDATION_FAILED', line: 1, extra: {} },
    { status: 400, code: 'GRAPHQL_VALIDATION_FAILED', line: 2, extra: { data: { id: 'partial' } } },
  ])('does not retry a different HTTP failure: %j', async ({ status, code, line, extra }) => {
    const client = createClient();
    const fetch = vi.spyOn(client.client, 'fetch');
    fetch.mockRejectedValue(
      new HTTPClientError(
        new Response(
          JSON.stringify({
            ...extra,
            errors: [
              {
                message: 'Request rejected',
                locations: [{ line, column: 3 }],
                extensions: { code },
              },
            ],
          }),
          { status }
        )
      )
    );
    await expect(
      runUsageQuery(client, () => 'query {\n  usageStatus { dataStatus }\n}', {}, { retries: 0 })
    ).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the HTTP error when its response body cannot be read', async () => {
    const client = createClient();
    const response = new Response('unreadable', { status: 400 });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('Response body unavailable'));
    const error = new HTTPClientError(response);
    const fetch = vi.spyOn(client.client, 'fetch').mockRejectedValue(error);

    await expect(client.runQuery('query { id }', {}, { retries: 0 })).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('GraphQL HTTP retries', () => {
  const fetch = vi.mocked(nodeFetch);
  const validationError = {
    message: "Your query doesn't match the schema. Try double-checking it!",
    locations: [{ line: 2, column: 3 }],
    extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
  };
  const requestedQueries = () =>
    fetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).query);

  beforeEach(() => {
    vi.useFakeTimers();
    fetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([2, 3])(
    'falls back after one validation rejection with %i configured retries, then remembers it',
    async (retries) => {
      const client = createClient();
      fetch.mockImplementation(async (_url, options) =>
        JSON.parse(String(options?.body)).query === usageQuery(true)
          ? new Response(JSON.stringify({ errors: [validationError] }), { status: 400 })
          : new Response(JSON.stringify({ data: { id: 'build' } }))
      );

      const result = runUsageQuery(client, usageQuery, {}, { retries });
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual({ id: 'build' });
      await expect(runUsageQuery(client, usageQuery, {}, { retries })).resolves.toEqual({
        id: 'build',
      });
      expect(requestedQueries()).toEqual([usageQuery(true), usageQuery(false), usageQuery(false)]);
    }
  );

  it.each(['server', 'network'])(
    'retries a transient %s failure without changing the query',
    async (failure) => {
      const client = createClient();
      if (failure === 'server') {
        fetch.mockResolvedValueOnce(new Response('Temporarily unavailable', { status: 500 }));
      } else {
        fetch.mockRejectedValueOnce(new Error('Connection reset'));
      }
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'build' } })));

      const result = runUsageQuery(client, usageQuery, {}, { retries: 2 });
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual({ id: 'build' });
      expect(requestedQueries()).toEqual([usageQuery(true), usageQuery(true)]);
    }
  );

  it.each([
    { errors: [{ ...validationError, extensions: { code: 'FORBIDDEN' } }] },
    { errors: [{ ...validationError, extensions: { code: 'BUDGET_EXCEEDED' } }] },
    { errors: [validationError, { message: 'Other failure', extensions: { code: 'FORBIDDEN' } }] },
    { errors: [{ ...validationError, path: ['announceBuild'] }] },
    { errors: [validationError], data: { id: 'partial' } },
    { errors: [validationError], data: null },
    { errors: [] },
    { errors: [{ extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] },
    'not JSON',
  ])('preserves retries and the HTTP body for a different HTTP 400 failure: %j', async (body) => {
    const client = createClient();
    const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
    fetch.mockImplementation(async () => new Response(responseBody, { status: 400 }));

    const result = expect(
      runUsageQuery(client, usageQuery, {}, { retries: 2 })
    ).rejects.toBeInstanceOf(HTTPClientError);
    await vi.runAllTimersAsync();
    await result;
    expect(requestedQueries()).toEqual([usageQuery(true), usageQuery(true), usageQuery(true)]);
    expect(client.client.log.debug).toHaveBeenCalledWith(responseBody);
  });

  it('does not retry an unrelated schema rejection or fall back to the legacy query', async () => {
    const client = createClient();
    const unrelatedError = { ...validationError, locations: [{ line: 1, column: 1 }] };
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ errors: [unrelatedError] }), { status: 400 })
    );

    const result = expect(
      runUsageQuery(client, usageQuery, {}, { retries: 2 })
    ).rejects.toMatchObject(unrelatedError);
    await vi.runAllTimersAsync();
    await result;
    expect(requestedQueries()).toEqual([usageQuery(true)]);
  });

  it.each([401, 429, 500])('preserves transport retries for HTTP %i', async (status) => {
    const client = createClient();
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ errors: [validationError] }), { status })
    );

    const result = expect(
      runUsageQuery(client, usageQuery, {}, { retries: 2 })
    ).rejects.toBeInstanceOf(HTTPClientError);
    await vi.runAllTimersAsync();
    await result;
    expect(requestedQueries()).toEqual([usageQuery(true), usageQuery(true), usageQuery(true)]);
  });

  it('keeps retrying GraphQL errors explicitly marked retryable', async () => {
    const client = createClient();
    fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: 'Try again', extensions: { code: 'RETRYABLE_ERROR_CODE' } }],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'build' } })));

    const result = runUsageQuery(client, usageQuery, {}, { retries: 2 });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ id: 'build' });
    expect(requestedQueries()).toEqual([usageQuery(true), usageQuery(true)]);
  });

  it('keeps HTTP retries unchanged for callers without a GraphQL retry policy', async () => {
    const client = createClient();
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ errors: [validationError] }), { status: 400 })
    );

    const result = expect(
      client.client.fetch('https://example.com/api', {}, { retries: 2 })
    ).rejects.toBeInstanceOf(HTTPClientError);
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
