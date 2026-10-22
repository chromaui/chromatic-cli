import { describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../io/graphqlClient';
import { runUsageQuery } from './runUsageQuery';

const query = (includeUsage: boolean) => (includeUsage ? 'query { usageStatus }' : 'query { id }');
const unsupported = {
  message: 'Cannot query field "usageStatus" on type "AnnouncedBuild".',
  extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
};

const makeClient = () => {
  const client: Pick<GraphQLClient, 'runQuery'> = { runQuery: vi.fn() };
  return { client, queryMock: vi.mocked(client.runQuery) };
};

describe('runUsageQuery', () => {
  it('uses the usage fields on current servers', async () => {
    const { client, queryMock } = makeClient();
    queryMock.mockResolvedValue({ id: 'build' });
    await expect(runUsageQuery(client, query, {}, {})).resolves.toEqual({ id: 'build' });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(query(true), {}, {});
  });

  it('retries schema rejection once and remembers it for subsequent polling', async () => {
    const { client, queryMock } = makeClient();
    queryMock.mockRejectedValueOnce(unsupported).mockResolvedValue({ id: 'build' });
    await runUsageQuery(client, query, {}, {});
    await runUsageQuery(client, query, {}, {});
    expect(queryMock.mock.calls.map(([text]) => text)).toEqual([
      query(true),
      query(false),
      query(false),
    ]);
  });

  it('supports multiple missing advisory fields without swallowing other validation errors', async () => {
    const { client, queryMock } = makeClient();
    queryMock
      .mockRejectedValueOnce([
        unsupported,
        { message: 'Cannot query field "optimization" on type "Build".' },
      ])
      .mockResolvedValue({});
    await runUsageQuery(client, query, {}, {});
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    new Error('Network request failed'),
    { message: 'Budget exceeded', extensions: { code: 'BUDGET_EXCEEDED' } },
    { ...unsupported, path: ['announceBuild'] },
    { ...unsupported, extensions: { code: 'FORBIDDEN' } },
    { message: 'Cannot query field "unrelatedField" on type "Build".' },
    [unsupported, { message: 'Unauthorized' }],
    [],
  ])(
    'does not retry a request that may have executed or failed for another reason: %j',
    async (error) => {
      const { client, queryMock } = makeClient();
      queryMock.mockRejectedValue(error);
      await expect(runUsageQuery(client, query, {}, {})).rejects.toBe(error);
      expect(queryMock).toHaveBeenCalledTimes(1);
    }
  );
});
