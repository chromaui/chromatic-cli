import frames from './upload.frames?clack';

export default {
  title: 'CLI/Tasks/Upload',
};

export const DryRun = () => frames.DryRun;
export const TurboSkipped = () => frames.TurboSkipped;

export const Invalid = () => frames.Invalid;
export const Starting = () => frames.Starting;
export const Uploading = () => frames.Uploading;
export const Finalizing = () => frames.Finalizing;
export const Success = () => frames.Success;
export const SuccessSkippedFiles = () => frames.SuccessSkippedFiles;
export const SuccessNoFiles = () => frames.SuccessNoFiles;
export const Failed = () => frames.Failed;
export const FailedReactNative = () => frames.FailedReactNative;
