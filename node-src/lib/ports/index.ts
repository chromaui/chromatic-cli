import GraphQLClient from '../../io/graphqlClient';
import HTTPClient from '../../io/httpClient';
import { Logger } from '../log';
import { ChromaticApi } from './chromaticApi';
import { createGraphqlChromaticApi } from './chromaticApiGraphqlAdapter';
import { FileSystem } from './fs';
import { createNodeFileSystem } from './fsNodeAdapter';
import { GitRepository } from './git';
import { createShellGitAdapter } from './gitShellAdapter';
import { ProcessRunner } from './processRunner';
import { createExecaProcessRunner } from './processRunnerExecaAdapter';
import { Uploader } from './uploader';
import { createHttpUploader } from './uploaderHttpAdapter';

/**
 * The collection of external-dependency boundaries ("ports") used by the
 * Chromatic CLI domain code. Each field is filled in by a dedicated
 * port-extraction PR as part of an ongoing refactoring project to eliminate
 * the context god object.
 */
export interface Ports {
  git: GitRepository;
  chromatic: ChromaticApi;
  uploader: Uploader;
  fs: FileSystem;
  proc: ProcessRunner;
}

interface DefaultPortsDeps {
  log: Logger;
  /**
   * Lazy accessor for the GraphQL client. The client is constructed partway
   * through `runAll`, after the HTTP client is configured, so adapters must
   * defer resolving it until first use.
   */
  getGraphQLClient: () => GraphQLClient;
  /**
   * Lazy accessor for the HTTP client. Same lifetime story as the GraphQL
   * client — constructed after the Ports bag is built.
   */
  getHttpClient: () => HTTPClient;
  /** Endpoint used by the auth-only CLI token mutation (usually `${indexUrl}/api`). */
  cliTokenEndpoint: string;
}

/**
 * Construct the production `Ports` bundle with real adapters wired up.
 *
 * @param deps Shared runtime dependencies the adapters need.
 * @param deps.log The logger forwarded to adapters that need it.
 * @param deps.getGraphQLClient Lazy accessor for the GraphQL client.
 * @param deps.cliTokenEndpoint Endpoint for the auth-only createCliToken mutation.
 *
 * @returns A `Ports` record wired with production adapters.
 */
export function createDefaultPorts(deps: DefaultPortsDeps): Ports {
  return {
    git: createShellGitAdapter({ log: deps.log }),
    chromatic: createGraphqlChromaticApi({
      getClient: deps.getGraphQLClient,
      cliTokenEndpoint: deps.cliTokenEndpoint,
    }),
    uploader: createHttpUploader({
      getHttp: deps.getHttpClient,
      log: deps.log,
    }),
    fs: createNodeFileSystem(),
    proc: createExecaProcessRunner(),
  };
}
