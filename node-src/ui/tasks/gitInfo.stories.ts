import task from '../components/task';
import {
  initial,
  pending,
  skipFailed,
  skippedForCommit,
  skippedRebuild,
  skippingBuild,
  success,
} from './gitInfo';

export default {
  title: 'CLI/Tasks/GitInfo',
  decorators: [(storyFunction) => task(storyFunction())],
};

const git = { commit: 'a32af7e265aa08e4a16d', branch: 'feat/new-ui', parentCommits: ['a', 'b'] };
const options = {};

export const Initial = () => initial;
export const Pending = () => pending();
export const Success = () => success({ git, options } as any);
export const FromFork = () => success({ git, options: { ownerName: 'chromaui' } } as any);
export const NoBaselines = () => success({ git: { ...git, parentCommits: [] }, options } as any);
export const TurboSnapDisabled = () =>
  success({ git, options, turboSnap: { bailReason: {} } } as any);
export const Skipping = () => skippingBuild({ git } as any);
export const Skipped = () => skippedForCommit({ git } as any);
export const SkippedRebuild = () => skippedRebuild();
export const SkipFailed = () => skipFailed();
