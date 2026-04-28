import nodePath from 'node:path';

import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { posix } from '../../lib/posix';
import type { Context, Options } from '../../types';
import type { GitState, StorybookState } from '../types';

export type StorybookInfoPhasePorts = Pick<Ports, 'storybook' | 'fs' | 'errors'>;

export interface StorybookInfoPhaseInput {
  options: Pick<Options, 'storybookBaseDir' | 'storybookConfigDir'>;
  /**
   * Git slice produced by the gitInfo phase. Forwarded to the legacy
   * `StorybookDetector.detect` adapter, which still expects a Context-shaped
   * argument with `git`, `options`, `log`, and `ports`.
   */
  git: GitState;
  log: Logger;
  ports: StorybookInfoPhasePorts;
}

export type StorybookInfoPhaseOutput = StorybookState;

/**
 * Pure orchestration of the `storybookInfo` phase. Detects the user's
 * Storybook configuration via the storybook port and resolves the base
 * directory relative to the git root. Side effects are limited to the
 * Sentry tag/context updates on the errors port.
 *
 * @param input Phase inputs.
 *
 * @returns The detected {@link StorybookState} slice.
 */
export async function runStorybookInfoPhase(
  input: StorybookInfoPhaseInput
): Promise<StorybookInfoPhaseOutput> {
  const detected = await input.ports.storybook.detect(makeLegacyContext(input));
  const storybook: StorybookState = {
    ...(detected as StorybookState),
    baseDir: resolveStorybookBaseDirectory(input),
  };

  if (storybook.version) {
    input.ports.errors.setTag('storybookVersion', storybook.version);
  }
  input.ports.errors.setContext('storybook', storybook);

  return storybook;
}

function resolveStorybookBaseDirectory(input: StorybookInfoPhaseInput): string {
  const { storybookBaseDir } = input.options;
  if (storybookBaseDir) return storybookBaseDir;
  const rootPath = input.git.rootPath;
  if (!rootPath) return '.';
  // path.relative does not have a leading '.', unless it starts with '../'.
  // path.join('.', '') === '.' and path.join('.', '../x') === '../x'.
  return posix(nodePath.join('.', nodePath.relative(rootPath, '')));
}

/**
 * Synthesize a Context-shaped argument for the legacy `StorybookDetector`
 * adapter. Real callers still expect a full Context for the detect call;
 * we project only the fields the adapter touches.
 *
 * @param input Phase inputs.
 *
 * @returns A Context-shaped value carrying the fields the adapter reads.
 */
function makeLegacyContext(input: StorybookInfoPhaseInput): Context {
  return {
    options: input.options,
    git: input.git,
    log: input.log,
    ports: input.ports,
  } as unknown as Context;
}
