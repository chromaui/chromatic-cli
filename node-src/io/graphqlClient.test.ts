import { Response } from 'node-fetch';
import { describe, expect, it, vi } from 'vitest';

import getEnvironment from '../lib/getEnvironment';
import { runUsageQuery } from '../lib/runUsageQuery';
import TestLogger from '../lib/testLogger';
import GraphQLClient from './graphqlClient';

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
});
