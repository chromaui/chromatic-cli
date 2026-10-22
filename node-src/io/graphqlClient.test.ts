import { Response } from 'node-fetch';
import { describe, expect, it, vi } from 'vitest';

import getEnvironment from '../lib/getEnvironment';
import { runUsageQuery } from '../lib/runUsageQuery';
import TestLogger from '../lib/testLogger';
import GraphQLClient from './graphqlClient';
import { HTTPClientError } from './httpClient';

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
