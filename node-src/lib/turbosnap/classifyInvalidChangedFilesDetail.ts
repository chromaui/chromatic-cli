import { InvalidChangedFilesBailReason } from '../../types';
import { captureBailException } from './captureBailException';
import {
  AncestorMissingError,
  BaselineDirtyError,
  GitCommandError,
  NetworkError,
  ReplacementFailedError,
} from './errors';

/**
 * Map an unknown thrown error to its `invalidChangedFiles` bail subreason, if recognized.
 *
 * @param err The thrown value to classify.
 *
 * @returns The matching subreason, or an empty object for an unclassified error.
 */
export function classifyInvalidChangedFilesDetail(
  err: unknown
): Partial<InvalidChangedFilesBailReason> {
  if (err instanceof AncestorMissingError) return { bailSubreason: 'ancestorMissing' };
  if (err instanceof BaselineDirtyError) return { bailSubreason: 'baselineDirty' };
  if (err instanceof NetworkError) return { bailSubreason: 'networkError' };
  if (err instanceof ReplacementFailedError) return { bailSubreason: 'replacementFailed' };
  if (err instanceof GitCommandError) return { bailSubreason: 'gitCommandFailed' };
  return {};
}

/**
 * Classify an error, report it to Sentry, and assemble the `invalidChangedFiles` bail reason to
 * record on the build.
 *
 * @param err The thrown value that caused the bail.
 *
 * @returns The bail reason, including the Sentry event ID for the captured error.
 */
export function invalidChangedFilesBailReason(err: unknown): InvalidChangedFilesBailReason {
  const { bailSubreason } = classifyInvalidChangedFilesDetail(err);
  const sentryEventId = captureBailException(err, {
    bailSubreason,
    bailPath: 'gitInfo.invalidChangedFiles',
  });
  return { invalidChangedFiles: true, bailSubreason, sentryEventId };
}
