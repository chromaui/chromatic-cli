import { TurboSnapBailReason } from '../../types';
import {
  AncestorMissingError,
  BaselineDirtyError,
  GitCommandError,
  NetworkError,
  ReplacementFailedError,
} from './errors';

// Extract all bail detail fields related to invalidChangedFiles
export type InvalidChangedFilesPatch = Partial<
  Extract<TurboSnapBailReason, { invalidChangedFiles: true }>
>;

/**
 * Map an unknown thrown error into a partial `TurboSnapBailReason` patch for the
 * `invalidChangedFiles` bail variant.
 *
 * @param err The thrown value to classify.
 *
 * @returns A partial patch object to merge into the bail reason.
 */
export function classifyInvalidChangedFilesDetail(err: unknown): InvalidChangedFilesPatch {
  if (err instanceof AncestorMissingError) return { bailSubreason: 'ancestorMissing' };
  if (err instanceof BaselineDirtyError) return { bailSubreason: 'baselineDirty' };
  if (err instanceof NetworkError) return { bailSubreason: 'networkError' };
  if (err instanceof ReplacementFailedError) return { bailSubreason: 'replacementFailed' };
  if (err instanceof GitCommandError) return { bailSubreason: 'gitCommandFailed' };
  return {};
}
