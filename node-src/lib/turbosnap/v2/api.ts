import GraphQLClient from '../../../io/graphqlClient';
import { TurboSnapManifest } from './manifest';

const UploadBuildHashesMutation = `
  mutation UploadBuildHashes(
    $buildId: ObjID!
    $storybookHash: String!
    $storyFileHashes: JSONObject!
    $storybookFileHashes: JSONObject!
  ) {
    uploadBuildHashes(
      buildId: $buildId,
      storybookHash: $storybookHash,
      storyFileHashes: $storyFileHashes,
      storybookFileHashes: $storybookFileHashes
    )
}
`;

// TODO: fill this out when we have a mutation defined
// interface DetermineChangedFilesMutationResult {
//   determineChangedFiles: {
//     changedFiles: string[];
//   };
// }

/**
 * Sends the story file, Storybook config file and whole-Storybook hashes to the Index and gets back
 * the list of changed story files.
 *
 * `storybookHash` is the Index's top-level gate: if it is unchanged nothing in Storybook changed and
 * no story needs recapturing. When it moves, the Index drills into the two hash maps —
 * `storyFileHashes` attributes the change to individual stories, while any change to a
 * `storybookFileHashes` entry (a `.storybook/preview.*` file or the `<storybookGlobals>` catch-all)
 * means Storybook-wide config changed and everything must be recaptured.
 *
 * @param graphqlClient The GraphQL client to use.
 * @param buildId The build ID associated with the manifest.
 * @param manifest The manifest whose story file, Storybook config file and Storybook hashes are sent
 * to the Index.
 *
 * @returns The changed files.
 */
// TODO: Implement this!
export async function determineChangedFiles(
  graphqlClient: GraphQLClient,
  buildId: string,
  manifest: TurboSnapManifest
) {
  const result = await graphqlClient.runQuery<boolean>(
    UploadBuildHashesMutation,
    {
      buildId,
      storybookHash: manifest.storybookHash,
      storyFileHashes: Object.fromEntries(manifest.storyFileHashes),
      storybookFileHashes: Object.fromEntries(manifest.storybookFiles),
    },
    { retries: 3 }
  );

  return result;
}
