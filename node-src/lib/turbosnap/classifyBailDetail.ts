import { TurboSnapBailReason } from '../../types';
import { SUPPORTED_LOCK_FILES } from './findChangedDependencies';

// Extract all bail detail fields related to changedPackageFiles
export type ChangedPackageFilesPatch = Partial<
  Extract<TurboSnapBailReason, { changedPackageFiles: string[] }>
>;

/**
 * Detect which supported lockfile kind a given path corresponds to.
 *
 * @param path The filesystem path to inspect.
 *
 * @returns The matching lockfile filename, or `undefined` if none match.
 */
export function detectLockfileKind(path: string): string | undefined {
  return SUPPORTED_LOCK_FILES.find((lockfile) => path.endsWith(lockfile));
}

/**
 * Map an unknown thrown error into a partial `TurboSnapBailReason` patch.
 *
 * @param _err The thrown value to classify.
 *
 * @returns A partial patch object to merge into the bail reason.
 */
export function classifyBailDetail(_err: unknown): ChangedPackageFilesPatch {
  return {};
}

/**
 * Derive a short, primary key describing bail reason. Used for grouping related bail reasons in
 * Sentry. Returns `'unknown'` when no specific flag is set.
 *
 * @param patch The bail-detail patch to inspect.
 *
 * @returns A short string key identifying the patch's primary key.
 */
export function bailDetailKey(patch: ChangedPackageFilesPatch): string {
  if (patch.lockfileSizeExceeded) return 'lockfileSizeExceeded';
  if (patch.lockfileParseFailed) return 'lockfileParseFailed';
  if (patch.baselineCheckoutFailed) return 'baselineCheckoutFailed';
  return 'unknown';
}
