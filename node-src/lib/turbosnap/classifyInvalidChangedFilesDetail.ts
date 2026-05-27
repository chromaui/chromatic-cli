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

export type InvalidChangedFilesDetailKey =
  | 'ancestorMissing'
  | 'baselineDirty'
  | 'replacementFailed'
  | 'networkError'
  | 'gitCommandFailed';

/**
 * Map an unknown thrown error into a partial `TurboSnapBailReason` patch for the
 * `invalidChangedFiles` bail variant.
 *
 * @param err The thrown value to classify.
 *
 * @returns A partial patch object to merge into the bail reason.
 */
export function classifyInvalidChangedFilesDetail(err: unknown): InvalidChangedFilesPatch {
  if (err instanceof AncestorMissingError) return { ancestorMissing: true };
  if (err instanceof BaselineDirtyError) return { baselineDirty: true };
  if (err instanceof NetworkError) return { networkError: true };
  if (err instanceof ReplacementFailedError) return { replacementFailed: true };
  if (err instanceof GitCommandError) return { gitCommandFailed: true };
  return {};
}

/**
 * Derive a short, primary key describing the bail detail. Used for grouping related bail reasons
 * in Sentry. Returns `undefined` when no specific flag is set.
 *
 * @param patch The bail-detail patch to inspect.
 *
 * @returns A short string key identifying the patch's primary key.
 */
export function invalidChangedFilesDetailKey(
  patch: InvalidChangedFilesPatch
): InvalidChangedFilesDetailKey | undefined {
  if (patch.ancestorMissing) return 'ancestorMissing';
  if (patch.baselineDirty) return 'baselineDirty';
  if (patch.networkError) return 'networkError';
  if (patch.replacementFailed) return 'replacementFailed';
  if (patch.gitCommandFailed) return 'gitCommandFailed';
  return;
}
