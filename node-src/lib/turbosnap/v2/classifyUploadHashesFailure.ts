import type { TurboSnapIndexContractViolationSubreason } from '../../../types';
import type { BuildUploadHashesError, BuildUploadHashesResponse } from './api';

/**
 * A rejection the CLI caused: we sent bad data, called at the wrong point in the build lifecycle, or
 * are talking to a schema we no longer understand. Each subreason is its own Sentry fingerprint.
 */
export interface UploadHashesFailure {
  bailSubreason: TurboSnapIndexContractViolationSubreason;
  error: Error;
}

/** Index error typenames, with and without the `Error` suffix the schema may or may not carry. */
const SUBREASON_BY_ERROR_TYPENAME = new Map<string, TurboSnapIndexContractViolationSubreason>([
  ['InvalidStoryFileHashes', 'invalidStoryFileHashes'],
  ['InvalidStoryFileHashesError', 'invalidStoryFileHashes'],
  ['InvalidUploadHashesBuildStatus', 'invalidBuildStatus'],
  ['InvalidUploadHashesBuildStatusError', 'invalidBuildStatus'],
]);

/**
 * Names the self-inflicted half of the hash upload contract. The mutation resolves rather than
 * throws on rejection, so without this check a server-side rejection is indistinguishable from
 * success. Transport failures throw and are classified by the caller instead.
 *
 * @param response The `buildUploadHashes` payload, or `undefined` when the field is missing entirely.
 *
 * @returns The named failure, or `undefined` when the response is a well-formed success.
 */
export function classifyUploadHashesFailure(
  response: BuildUploadHashesResponse | undefined
): UploadHashesFailure | undefined {
  const errors = response?.errors;
  if (errors && errors.length > 0) {
    const bailSubreason = selectErrorSubreason(errors);
    return {
      bailSubreason,
      error: new Error(`Index rejected the hash upload: ${describeErrors(errors)}`),
    };
  }

  if (response?.build) return undefined;

  return {
    bailSubreason: 'invalidResponse',
    error: new Error('Hash upload response matched neither member of the mutation union'),
  };
}

// An errors array we cannot name is schema drift just as much as a response matching neither member,
// so it groups under the same fingerprint.
function selectErrorSubreason(
  errors: BuildUploadHashesError[]
): TurboSnapIndexContractViolationSubreason {
  for (const error of errors) {
    const subreason = error.__typename && SUBREASON_BY_ERROR_TYPENAME.get(error.__typename);
    if (subreason) return subreason;
  }
  return 'invalidResponse';
}

function describeErrors(errors: BuildUploadHashesError[]): string {
  return errors
    .map((error) => [error.__typename, error.message].filter(Boolean).join(': ') || 'unknown error')
    .join('; ');
}
