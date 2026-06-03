import path from 'path';

import { ChangedPackageFilesBailReason } from '../../types';
import {
  BaselineCheckoutFailedError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
} from './errors';
import { SUPPORTED_LOCK_FILES } from './findChangedDependencies';

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
export function classifyBailDetail(err: unknown): Partial<ChangedPackageFilesBailReason> {
  if (err instanceof LockFileSizeExceededError) {
    const lockfileKind = detectLockfileKind(err.lockfilePath);
    return {
      bailSubreason: 'lockfileSizeExceeded',
      ...(lockfileKind && { lockfileKind }),
      lockfileSizeBytes: err.lockfileSizeBytes,
    };
  }
  if (err instanceof LockFileParseFailedError) {
    const lockfileKind = detectLockfileKind(err.lockfilePath);
    return {
      bailSubreason: 'lockfileParseFailed',
      ...(lockfileKind && { lockfileKind }),
    };
  }
  if (err instanceof BaselineCheckoutFailedError) {
    return { bailSubreason: 'baselineCheckoutFailed' };
  }
  return {};
}
