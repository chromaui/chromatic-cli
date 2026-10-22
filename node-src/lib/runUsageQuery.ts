import { z } from 'zod';

import GraphQLClient from '../io/graphqlClient';

const legacyQueries = new WeakMap<Pick<GraphQLClient, 'runQuery'>, Set<string>>();

const validationError = z.object({
  message: z.string(),
  path: z.never().optional(),
  extensions: z.object({ code: z.literal('GRAPHQL_VALIDATION_FAILED').optional() }).optional(),
  locations: z
    .array(z.object({ line: z.number().int().positive(), column: z.number().int().positive() }))
    .optional(),
});

function isUnsupportedUsageField(error: unknown, query: string): boolean {
  const result = validationError.safeParse(error);
  if (!result.success) return false;
  const { message, extensions, locations } = result.data;
  if (
    /^Cannot query field "(?:usageStatus|optimization)" on type "(?:AnnouncedBuild|Build)"\./.test(
      message
    )
  )
    return true;

  // Production redacts validation messages. Require the exact validation code and
  // a source location pointing at one of our new root fields, never an unrelated field.
  return (
    extensions?.code === 'GRAPHQL_VALIDATION_FAILED' &&
    !!locations?.length &&
    locations.every(({ line, column }) =>
      /^(?:usageStatus|optimization)\s*\{/.test(
        query.split('\n')[line - 1]?.slice(column - 1) || ''
      )
    )
  );
}

/**
 * Retry only a rejected schema validation, where a mutation has not executed.
 *
 * @param client The authenticated GraphQL client.
 * @param query Builds the current or legacy selection.
 * @param variables Variables reused only after validation rejection.
 * @param options Request headers and retry configuration.
 *
 * @returns The server result without changing execution failures.
 */
export async function runUsageQuery<T>(
  client: Pick<GraphQLClient, 'runQuery'>,
  query: (includeUsage: boolean) => string,
  variables: Parameters<GraphQLClient['runQuery']>[1],
  options: Parameters<GraphQLClient['runQuery']>[2]
): Promise<T> {
  const currentQuery = query(true);
  if (legacyQueries.get(client)?.has(currentQuery)) {
    return client.runQuery<T>(query(false), variables, options);
  }
  try {
    return await client.runQuery<T>(currentQuery, variables, options);
  } catch (error) {
    const errors: unknown[] = Array.isArray(error) ? error : [error];
    if (errors.length === 0 || !errors.every((item) => isUnsupportedUsageField(item, currentQuery)))
      throw error;
    const unsupported = legacyQueries.get(client) || new Set<string>();
    unsupported.add(currentQuery);
    legacyQueries.set(client, unsupported);
    return client.runQuery<T>(query(false), variables, options);
  }
}
