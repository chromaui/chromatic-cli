import frames from './uploadE2E.frames?clack';

export default {
  title: 'CLI/Tasks/Upload/E2E',
};

export const Starting = () => frames.Starting;
export const Uploading = () => frames.Uploading;
export const Finalizing = () => frames.Finalizing;
export const Success = () => frames.Success;
export const SuccessSkippedFiles = () => frames.SuccessSkippedFiles;
export const SuccessNoFiles = () => frames.SuccessNoFiles;
export const DryRun = () => frames.DryRun;
export const Invalid = () => frames.Invalid;
export const Failed = () => frames.Failed;
