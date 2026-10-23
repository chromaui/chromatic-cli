import { Response } from 'node-fetch';
import { expect, it, vi } from 'vitest';

import getEnvironment from '../lib/getEnvironment';
import TestLogger from '../lib/testLogger';
import GraphQLClient from './graphqlClient';

it('preserves validation errors without a field path so callers can detect unsupported inputs', async () => {
  const client = new GraphQLClient(
    { log: new TestLogger(), env: getEnvironment() },
    'https://example.invalid/graphql',
    {}
  );
  const error = {
    message:
      'Variable "$input" got invalid value { configCoverage: {} }; Field "configCoverage" is not defined by type "BuildUploadHashesInput".',
    extensions: { code: 'BAD_USER_INPUT' },
  };
  const fetch = vi
    .spyOn(client.client, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ errors: [error] })));
  await expect(client.runQuery('mutation Test { test }', {}, { retries: 0 })).rejects.toMatchObject(
    error
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
