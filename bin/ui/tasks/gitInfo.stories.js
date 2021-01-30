import task from '../components/task';
import { initial, pending, skipFailed, skippedForCommit, skippingBuild, success } from './gitInfo';

export default {
  title: 'CLI/Tasks/GitInfo',
  decorators: [(storyFn) => task(storyFn())],
};

const git = { commit: 'a32af7e265aa08e4a16d', branch: 'new-ui', baselineCommits: ['a', 'b'] };
const options = { ownerName: 'chromaui' };

export const Initial = () => initial;
export const Pending = () => pending({});
export const Success = () => success({ git, options });
export const NoBaselines = () => success({ git: { ...git, baselineCommits: [] }, options });
export const Skipping = () => skippingBuild({ git, skipReason: '--skip' });
export const SkippingFiles = () => skippingBuild({ git, skipReason: '--skip-files' });
export const Skipped = () => skippedForCommit({ git, skipReason: '--skip' });
export const SkippedFiles = () => skippedForCommit({ git, skipReason: '--skip-files' });
export const SkipFailed = () => skipFailed();
