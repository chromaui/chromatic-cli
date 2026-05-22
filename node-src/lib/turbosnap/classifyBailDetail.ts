import path from 'path';

import { TurboSnapBailReason } from '../../types';
import {
  BaselineCheckoutFailedError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
} from './errors';
import { SUPPORTED_LOCK_FILES } from './findChangedDependencies';

// Extract all bail detail fields related to changedPackageFiles
export type ChangedPackageFilesPatch = Partial<
  Extract<TurboSnapBailReason, { changedPackageFiles: string[] }>
>;

export type BailDetailKey =
  | 'lockfileSizeExceeded'
  | 'lockfileParseFailed'
  | 'baselineCheckoutFailed'
  | 'unknown';

/**
 * Detect which supported lockfile kind a given path corresponds to.
 *
 * @param filePath The filesystem path to inspect.
 *
 * @returns The matching lockfile filename, or `undefined` if none match.
 */
export function detectLockfileKind(filePath: string): string | undefined {
  const basename = path.basename(filePath);
  return SUPPORTED_LOCK_FILES.find((lockfile) => basename === lockfile);
}

/**
 * Map an unknown thrown error into a partial `TurboSnapBailReason` patch.
 *
 * @param err The thrown value to classify.
 *
 * @returns A partial patch object to merge into the bail reason.
 */
export function classifyBailDetail(err: unknown): ChangedPackageFilesPatch {
  if (err instanceof LockFileSizeExceededError) {
    const lockfileKind = detectLockfileKind(err.lockfilePath);
    return {
      lockfileSizeExceeded: true,
      ...(lockfileKind && { lockfileKind }),
      lockfileSizeBytes: err.lockfileSizeBytes,
    };
  }
  if (err instanceof LockFileParseFailedError) {
    const lockfileKind = detectLockfileKind(err.lockfilePath);
    return {
      lockfileParseFailed: true,
      ...(lockfileKind && { lockfileKind }),
    };
  }
  if (err instanceof BaselineCheckoutFailedError) {
    return { baselineCheckoutFailed: true };
  }
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
export function bailDetailKey(patch: ChangedPackageFilesPatch): BailDetailKey {
  if (patch.lockfileSizeExceeded) return 'lockfileSizeExceeded';
  if (patch.lockfileParseFailed) return 'lockfileParseFailed';
  if (patch.baselineCheckoutFailed) return 'baselineCheckoutFailed';
  return 'unknown';
}
