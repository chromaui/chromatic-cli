import task from '../components/task';
import { initial, pending, skipFailed, skippedForCommit, success } from './gitInfo';

export default {
  title: 'CLI/Tasks/GitInfo',
  decorators: [storyFn => task(storyFn())],
};

const git = { commit: 'a32af7e265aa08e4a16d', branch: 'new-ui', baselineCommits: ['a', 'b'] };

export const Initial = () => initial;
export const Pending = () => pending({});
export const Success = () => success({ git });
export const NoBaselines = () => success({ git: { ...git, baselineCommits: [] } });
export const Skipped = () => skippedForCommit({ git });
export const SkipFailed = () => skipFailed();
