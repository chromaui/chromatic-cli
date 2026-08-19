import GraphQLClient from '../../../io/graphqlClient';
import { TurboSnapManifest } from './manifest';

const BuildUploadHashesMutation = `
  mutation BuildUploadHashes($input: BuildUploadHashesInput!) {
    buildUploadHashes(input: $input) {
      ... on BuildUploadHashesSuccess {
        build {
          turboSnapStatus
          turboSnapMechanism
        }
      }
      ... on BuildUploadHashesFailure {
        errors {
          ... on MutationError {
            message
          }
        }
      }
    }
  }
`;

/** How the Index decided `onlyStoryFiles`. Absent means it did not decide by hash. */
type TurboSnapMechanism = 'GIT_BASED' | 'HASH_BASED';

/**
 * The `BuildUploadHashesInput` the CLI sends. It mirrors the Index's input type so a schema change
 * on that side surfaces here as a type error rather than a runtime rejection.
 *
 * `storybookConfigHashes` is a map of Storybook-wide category roll-ups to their hashes. The Index
 * requires `storybookVersion` and `storybookConfigFiles`; the remaining categories (`preview`,
 * `storybookGlobals`, `staticFiles`) ride its catch-all. Every value is a string, so the manifest's
 * `FileHash | StorybookVersion` entries map onto it directly.
 */
interface BuildUploadHashesInput {
  buildId: string;
  storybookHash: string;
  storybookConfigHashes: Record<string, string>;
  storyFileHashes: Record<string, string>;
}

/**
 * The mutation payload: the updated build on success, or the errors that prevented the upload. We do
 * not distinguish the individual error types, only whether the upload failed and what it reported.
 */
export interface BuildUploadHashesResponse {
  /** Present on success. The Index sets these itself; the CLI does not send them. */
  build?: {
    turboSnapStatus?: string;
    turboSnapMechanism?: TurboSnapMechanism;
  };
  /** Present on failure. */
  errors?: { message?: string }[];
}

interface BuildUploadHashesResult {
  buildUploadHashes: BuildUploadHashesResponse;
}

/**
 * Sends the whole-Storybook hash and the per-story hashes from the TurboSnap manifest to the Index,
 * which compares them against the build's ancestors to determine which stories need to be
 * recaptured.
 *
 * @param graphqlClient The GraphQL client to use.
 * @param buildId The build ID associated with the manifest.
 * @param manifest The manifest whose Storybook and story file hashes are sent to the Index.
 *
 * @returns The mutation result: the updated build on success, or the errors that prevented the upload.
 */
export async function uploadHashes(
  graphqlClient: GraphQLClient,
  buildId: string,
  manifest: TurboSnapManifest
): Promise<BuildUploadHashesResponse> {
  const input: BuildUploadHashesInput = {
    buildId,
    storybookHash: manifest.storybookHash,
    storybookConfigHashes: Object.fromEntries(manifest.storybookFileHashes),
    storyFileHashes: Object.fromEntries(manifest.storyFileHashes),
  };

  const { buildUploadHashes } = await graphqlClient.runQuery<BuildUploadHashesResult>(
    BuildUploadHashesMutation,
    { input },
    { retries: 3 }
  );

  return buildUploadHashes;
}
