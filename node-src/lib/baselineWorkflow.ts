import { BaselineWorkflow, Options } from '../types';
import matchesBranch from './matchesBranch';
import { exitCodes, TaskFailure } from './setExitCode';

export const hasBaselineWorkflow = (options: Partial<Options>) =>
  options.requireBaseline !== undefined || !!options.bypassIfUnchanged;

/**
 * Validate the supported pilot scope before any early skip can report success.
 *
 * @param options Resolved options after CLI/config/programmatic precedence.
 */
export function validateBaselineWorkflowOptions(options: Partial<Options>) {
  if (!hasBaselineWorkflow(options)) return;
  if (
    options.requireBaseline !== undefined &&
    (typeof options.requireBaseline !== 'string' ||
      !/^(?:[\da-f]{40}|[\da-f]{64})$/i.test(options.requireBaseline))
  ) {
    throw new Error(
      '--require-baseline must be a full Git commit ID (40 or 64 hexadecimal characters).'
    );
  }
  if (options.skip === true) {
    throw new Error('--skip cannot be combined with --require-baseline or --bypass-if-unchanged.');
  }
  if ([options.patchBaseRef, options.patchHeadRef].some(Boolean)) {
    throw new Error('Baseline workflows do not support --patch-build.');
  }
  if (
    [
      options.isLocalBuild,
      options.playwright,
      options.cypress,
      options.vitest,
      options.reactNative,
      options.url,
    ].some(Boolean)
  ) {
    throw new Error('Baseline workflows support only committed Storybook CI builds.');
  }
  if (options.bypassIfUnchanged && options.onlyChanged === false) {
    throw new Error('--bypass-if-unchanged cannot be combined with onlyChanged: false.');
  }
}

/**
 * Reject an active branch skip, including the tokenless skip shortcut.
 *
 * @param options Resolved options.
 * @param branch The branch Chromatic will test.
 */
export function validateBaselineWorkflowSkip(options: Partial<Options>, branch: string) {
  if (hasBaselineWorkflow(options) && matchesBranch(branch, options.skip ?? false)) {
    throw new TaskFailure(
      '--skip matches this branch and cannot be combined with --require-baseline or --bypass-if-unchanged.',
      { exitCode: exitCodes.INVALID_OPTIONS, userError: true }
    );
  }
}

/**
 * Stop opted-in builds until the authenticated server protocol is integrated.
 * The caller persists diagnostics before raising this failure.
 *
 * @param workflow Local validation result.
 * @param commit The feature or main commit being tested.
 *
 * @returns A build failure that cannot be relaxed by visual-result exit options.
 */
export function baselineWorkflowUnavailable(workflow: BaselineWorkflow, commit: string) {
  return new TaskFailure(
    [
      'Chromatic cannot run this baseline workflow yet.',
      `Commit: ${commit}`,
      ...(workflow.requiredCommit ? [`Required main baseline: ${workflow.requiredCommit}`] : []),
      `Reason: ${workflow.reason}. This CLI includes validation groundwork only; the server protocol is not integrated.`,
      'Use a CLI with the agreed server protocol after the pilot is enabled, then rerun this commit.',
      'No build was announced and no visual comparisons were created.',
    ].join('\n'),
    { exitCode: exitCodes.BUILD_FAILED, userError: true }
  );
}
