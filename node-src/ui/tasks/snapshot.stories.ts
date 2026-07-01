import frames from './snapshot.frames?clack';

export default {
  title: 'CLI/Tasks/Snapshot',
};

export const Pending = () => frames.Pending;
export const PendingOnlyChanged = () => frames.PendingOnlyChanged;
export const PendingOnlyStoryNames = () => frames.PendingOnlyStoryNames;
export const BuildPassed = () => frames.BuildPassed;
export const BuildComplete = () => frames.BuildComplete;
export const BuildAutoAccepted = () => frames.BuildAutoAccepted;
export const BuildBroken = () => frames.BuildBroken;
export const BuildFailed = () => frames.BuildFailed;
export const BuildCanceled = () => frames.BuildCanceled;
export const DryRun = () => frames.DryRun;
export const SkippedPublishOnly = () => frames.SkippedPublishOnly;
export const SkippedList = () => frames.SkippedList;
export const SkippedExitOnceUploaded = () => frames.SkippedExitOnceUploaded;
