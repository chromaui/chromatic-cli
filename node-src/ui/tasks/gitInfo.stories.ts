import frames from './gitInfo.frames?clack';

export default {
  title: 'CLI/Tasks/GitInfo',
};

export const Pending = () => frames.Pending;
export const Success = () => frames.Success;
export const FromFork = () => frames.FromFork;
export const NoBaselines = () => frames.NoBaselines;
export const TurboSnapDisabled = () => frames.TurboSnapDisabled;
export const Skipping = () => frames.Skipping;
export const Skipped = () => frames.Skipped;
export const SkippedRebuild = () => frames.SkippedRebuild;
export const SkipFailed = () => frames.SkipFailed;
