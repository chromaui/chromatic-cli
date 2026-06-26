import frames from './prepareE2E.frames?clack';

export default {
  title: 'CLI/Tasks/Prepare/E2E',
};

export const Validating = () => frames.Validating;
export const Invalid = () => frames.Invalid;
export const Tracing = () => frames.Tracing;
export const BailedPackageFile = () => frames.BailedPackageFile;
export const BailedLockfile = () => frames.BailedLockfile;
export const BailedSiblings = () => frames.BailedSiblings;
export const Traced = () => frames.Traced;
export const Hashing = () => frames.Hashing;
export const Success = () => frames.Success;
