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
          __typename
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

/** One entry of the failure member. `__typename` is what tells the rejections apart. */
export interface BuildUploadHashesError {
  __typename?: string;
  message?: string;
}

/**
 * The mutation payload. Both members are optional because a response matching neither is a real
 * case the CLI has to name rather than assume away.
 */
export interface BuildUploadHashesResponse {
  /** Present on success. The Index sets these itself; the CLI does not send them. */
  build?: {
    turboSnapStatus?: string;
    turboSnapMechanism?: TurboSnapMechanism;
  };
  /** Present on failure. */
  errors?: BuildUploadHashesError[];
}

interface BuildUploadHashesResult {
  buildUploadHashes: BuildUploadHashesResponse;
}

/**
 * Sends the whole-Storybook hash and the per-story hashes to the Index, which compares them against
 * the build's ancestors and writes `onlyStoryFiles` onto the build itself. The changed files are
 * therefore never returned to the CLI — only whether the Index took the decision, via
 * `turboSnapMechanism: HASH_BASED`.
 *
 * `storybookHash` is the Index's top-level gate: if it is unchanged nothing in Storybook changed and
 * no story needs recapturing. When it moves, the Index drills into `storyFileHashes` to attribute the
 * change to individual stories.
 *
 * `storybookFiles` is deliberately **not** sent: `BuildUploadHashesInput` has no field for it. Until
 * the Index adds one, a change confined to a `storybookFiles` entry — a static asset, `main.ts`, a
 * `preview.*` edit, a Storybook upgrade — moves `storybookHash` while matching no story, so the Index
 * captures nothing where v1 bails. That gap is tracked as a P0 on the TurboSnap 2.0 Index Fixes page;
 * it is recorded there rather than worked around here, because the CLI cannot express it.
 *
 * The manifest's `outOfGraphFiles` sections stay out of the request too, but for a different reason:
 * they exist to name *which* file moved for the S3 debug view, and the Index only ever needs the one
 * roll-up value per section.
 *
 * @param graphqlClient The GraphQL client to use.
 * @param buildId The build ID associated with the manifest.
 * @param manifest The manifest whose Storybook and story file hashes are sent to the Index.
 *
 * @returns The mutation result: the updated build on success, or the errors that prevented the upload.
 */
export async function determineChangedFiles(
  graphqlClient: GraphQLClient,
  buildId: string,
  manifest: TurboSnapManifest
): Promise<BuildUploadHashesResponse> {
  const result = await graphqlClient.runQuery<BuildUploadHashesResult>(
    BuildUploadHashesMutation,
    {
      input: {
        buildId,
        storybookHash: manifest.storybookHash,
        storyFileHashes: Object.fromEntries(manifest.storyFileHashes),
      },
    },
    { retries: 3 }
  );

  return result.buildUploadHashes;
}
