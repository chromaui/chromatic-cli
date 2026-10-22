import GraphQLClient from '../io/graphqlClient';

const legacyQueries = new WeakMap<Pick<GraphQLClient, 'runQuery'>, Set<string>>();

function isUnsupportedUsageField(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  if (typeof error.message !== 'string') return false;
  if ('path' in error) return false;
  if ('extensions' in error && !isValidationExtension(error.extensions)) return false;
  return /^Cannot query field "(?:usageStatus|optimization)" on type "(?:AnnouncedBuild|Build)"\./.test(
    error.message
  );
}

function isValidationExtension(extensions: unknown): boolean {
  return (
    !extensions ||
    typeof extensions !== 'object' ||
    !('code' in extensions) ||
    extensions.code === 'GRAPHQL_VALIDATION_FAILED'
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
    if (errors.length === 0 || !errors.every((item) => isUnsupportedUsageField(item))) throw error;
    const unsupported = legacyQueries.get(client) || new Set<string>();
    unsupported.add(currentQuery);
    legacyQueries.set(client, unsupported);
    return client.runQuery<T>(query(false), variables, options);
  }
}
