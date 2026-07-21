import GraphQLClient from '../../../io/graphqlClient';
import { TurboSnapManifest } from './manifest';

const UploadBuildHashesMutation = `
  mutation UploadBuildHashes(
    $buildId: ObjID!
    $storybookHash: String!
    $storyFileHashes: JSONObject!
  ) {
    uploadBuildHashes(
      buildId: $buildId,
      storybookHash: $storybookHash,
      storyFileHashes: $storyFileHashes
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
 * Sends the story file and Storybook hashes to the Index and gets back the list of changed story
 * files.
 *
 * @param graphqlClient The GraphQL client to use.
 * @param buildId The build ID associated with the manifest.
 * @param manifest The manifest whose story file and Storybook hashes are sent to the Index.
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
    },
    { retries: 3 }
  );

  return result;
}
