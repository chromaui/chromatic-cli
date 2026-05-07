import { InitialContext } from '.';
import GraphQLClient from './io/graphqlClient';
import HTTPClient from './io/httpClient';
import { getConfiguration } from './lib/getConfiguration';
import { Context } from './types';

/**
 * Wire up an initial context with the HTTP/GraphQL clients and resolved configuration. Callers are
 * responsible for setting `options` and `runtime` on the returned context.
 *
 * @param ctx The initial context being prepared.
 * @param configFile Optional path to the Chromatic config file.
 *
 * @returns The same context cast to a `Context`. Note that `options` and `runtime` are not set here
 * and must be assigned by the caller before the context is fully valid.
 */
export async function setupContext(ctx: InitialContext, configFile?: string): Promise<Context> {
  ctx.http = new HTTPClient(ctx);
  ctx.client = new GraphQLClient(ctx, `${ctx.env.CHROMATIC_INDEX_URL}/graphql`, {
    headers: {
      'x-chromatic-session-id': ctx.sessionId,
      'x-chromatic-cli-version': ctx.pkg.version,
      'apollographql-client-name': 'chromatic-cli',
      'apollographql-client-version': ctx.pkg.version,
    },
    retries: 3,
  });
  ctx.configuration = await getConfiguration(configFile);
  return ctx as Context;
}
