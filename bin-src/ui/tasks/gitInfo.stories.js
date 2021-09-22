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
  decorators: [(storyFn) => task(storyFn())],
};

const git = { commit: 'a32af7e265aa08e4a16d', branch: 'new-ui', parentCommits: ['a', 'b'] };
const options = { ownerName: 'chromaui' };

export const Initial = () => initial;
export const Pending = () => pending({});
export const Success = () => success({ git, options });
export const NoBaselines = () => success({ git: { ...git, parentCommits: [] }, options });
export const Skipping = () => skippingBuild({ git });
export const Skipped = () => skippedForCommit({ git });
export const SkippedRebuild = () => skippedRebuild();
export const SkipFailed = () => skipFailed();
