import * as Sentry from '@sentry/node';
import path from 'path';

import { GitDeps } from '../../git/execGit';
import { ChangedFileWithStatus, getChangedFilesWithStatus } from '../../git/git';
import { BaselineCheckoutFailedError } from './errors';

/**
 * Classify an error captured at the TurboSnap bail site into additional Sentry tags describing its
 * root cause.
 *
 * @param deps Function dependencies.
 * @param error The error captured at the bail site.
 *
 * @returns A map of Sentry tags, or `undefined` when the error type is not recognized.
 */
export async function classifyTagsFromError(
  deps: GitDeps,
  error: unknown
): Promise<Record<string, string> | undefined> {
  if (error instanceof BaselineCheckoutFailedError) {
    return classifyBaselineCheckoutFailureTags(deps, error);
  }

  return undefined;
}

/**
 * Refined root-cause kinds for a BaselineCheckoutFailedError.
 *
 * These exist for Sentry ONLY and are not sent to the backend.
 */
export type BaselineCheckoutFailureKind =
  | 'baselineManifestMoved'
  | 'baselineManifestAdded'
  | 'unknownBaselineCheckoutFailure';

/**
 * Check git to determine the root cause of a BaselineCheckoutFailedError.
 *
 * @param deps Function dependencies.
 * @param error The error captured at the bail site.
 *
 * @returns The refined failure kind or `undefined` when `error` is not a
 * `BaselineCheckoutFailedError`.
 */
async function classifyBaselineCheckoutFailureTags(
  deps: GitDeps,
  error: unknown
): Promise<Record<'baseline_failure_kind', BaselineCheckoutFailureKind> | undefined> {
  if (!(error instanceof BaselineCheckoutFailedError)) {
    return undefined;
  }

  const { reference, fileName } = parsePathspec(error.pathspec);

  try {
    // Determine how the file changed between the baseline and HEAD (such as if it was added, moved,
    // renamed, etc).
    const basename = path.basename(fileName);
    const changes = await getChangedFilesWithStatus(
      deps,
      reference,
      'HEAD',
      // See https://git-scm.com/docs/gitglossary#Documentation/gitglossary.txt-pathspec for details
      //
      // `glob` allows us to pass in a glob pattern
      // `top` anchors the response to the root of the repository (so we can catch cross-directory changes)
      `:(glob,top)**/${basename}`
    );
    return { baseline_failure_kind: classifyManifestChange(changes, fileName) };
  } catch (err) {
    // We capture the exception higher in the stack so we can simply attach the error context here.
    Sentry.addBreadcrumb({
      level: 'error',
      category: 'classifyBaselineCheckoutFailure',
      message: 'Error classifying baseline checkout failure',
      data: {
        error: err,
      },
    });

    return { baseline_failure_kind: 'unknownBaselineCheckoutFailure' };
  }
}

/**
 * Determine if the file was moved or added or something else.
 *
 * @param changes The parsed changed files from the diff.
 * @param fileName The failed file path to match against.
 *
 * @returns The matching manifest failure kind.
 */
function classifyManifestChange(
  changes: ChangedFileWithStatus[],
  fileName: string
): BaselineCheckoutFailureKind {
  // Check renames first so a moved manifest is never mislabeled as added.
  if (changes.some((change) => change.status === 'renamed' && change.path === fileName)) {
    return 'baselineManifestMoved';
  }
  if (changes.some((change) => change.status === 'added' && change.path === fileName)) {
    return 'baselineManifestAdded';
  }
  return 'unknownBaselineCheckoutFailure';
}

/**
 * Split a pathspec of the form `<reference>:<fileName>` into its parts.
 *
 * @param pathspec The pathspec carried by a `BaselineCheckoutFailedError`.
 *
 * @returns The baseline reference (SHA) and the file path.
 */
function parsePathspec(pathspec: string): { reference: string; fileName: string } {
  // Find the first colon which separates the reference from the file path. We can't just split on
  // colon and return the first and second parts since files can contain colons.
  const separatorIndex = pathspec.indexOf(':');
  return {
    reference: pathspec.slice(0, separatorIndex),
    fileName: pathspec.slice(separatorIndex + 1),
  };
}
