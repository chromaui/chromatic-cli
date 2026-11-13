import path from 'path';

import {
  ChangedPackageFilesBailReason,
  ChangedStorybookFilesBailReason,
  InvalidChangedFilesBailReason,
} from '../../../types';
import { SUPPORTED_LOCK_FILES } from '../../utilities';
import { stripConcatenatedModuleSuffix } from '../statsPaths';
import { storybookConfigFileKind } from '../storybookConfigFiles';
import {
  AncestorMissingError,
  BaselineCheckoutFailedError,
  BaselineDirtyError,
  GitCommandError,
  LockFileParseFailedError,
  LockFileSizeExceededError,
  NetworkError,
  ReplacementFailedError,
} from './errors';

/**
 * Detect which supported lockfile kind a given path corresponds to.
 *
 * @param filePath The filesystem path to inspect.
 *
 * @returns The matching lockfile filename, or `undefined` if none match.
 */
function detectLockfileKind(filePath: string): string | undefined {
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
export function classifyChangedPackageFilesDetail(
  err: unknown
): Partial<ChangedPackageFilesBailReason> {
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
 * Pick the `changedStorybookFiles` bail subreason for the module a trace bailed on. The allowlist
 * check is the shared one, so a subreason names an allowlisted file exactly when TurboSnap 2.0
 * treats that file as config.
 *
 * @param bailFile The repository-relative name of the module the trace bailed on.
 * @param options Where the bail happened.
 * @param options.traced Whether the trace reached `bailFile` from a different changed file.
 * @param options.isAnnotationFile Whether a builder's preview-annotations module imports `bailFile`.
 * @param options.storybookDirectory The repository-relative Storybook config directory.
 *
 * @returns The subreason to merge into the bail reason, or an empty object for any other file.
 */
export function classifyChangedStorybookFilesDetail(
  bailFile: string,
  {
    traced,
    isAnnotationFile,
    storybookDirectory,
  }: { traced: boolean; isAnnotationFile: boolean; storybookDirectory: string }
): Pick<ChangedStorybookFilesBailReason, 'bailSubreason'> {
  const kind = storybookConfigFileKind(stripConcatenatedModuleSuffix(bailFile), storybookDirectory);
  if (kind === 'previewConfig' && traced) return { bailSubreason: 'importsOfPreviewConfig' };
  if (kind) return { bailSubreason: kind };
  if (isAnnotationFile) return { bailSubreason: 'importsOfPreviewConfig' };
  // Any other config-directory file bails without a subreason.
  return {};
}
