import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import {
  pending,
  skipFailed,
  skippedForCommit,
  skippedRebuild,
  skippingBuild,
  success,
} from './gitInfo';

// Node-side scenarios for the gitInfo task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack renderer, and hands the resulting ANSI strings to the
// browser story (`gitInfo.stories.ts`).

const git = { commit: 'a32af7e265aa08e4a16d', branch: 'feat/new-ui', parentCommits: ['a', 'b'] };
const options = {};

export const Pending = () => captureTask(pending());

export const Success = () => captureTask(success({ git, options } as any));

export const FromFork = () =>
  captureTask(success({ git, options: { ownerName: 'chromaui' } } as any));

export const NoBaselines = () =>
  captureTask(success({ git: { ...git, parentCommits: [] }, options } as any));

export const TurboSnapDisabled = () =>
  captureTask(success({ git, options, turboSnap: { bailReason: {} } } as any));

export const Skipping = () => captureTask(skippingBuild(git as any), pending());

export const Skipped = () => captureTask(skippedForCommit({ git } as any));

export const SkippedRebuild = () => captureTask(skippedRebuild());

// gitInfo registers no `failure` transition, so a skip failure renders the engine's fallback
// failure state, built from the pending title and the error gatherGitInfo throws.
export const SkipFailed = () =>
  captureTask(fallbackFailureState(pending().title, new Error(skipFailed().output)));
