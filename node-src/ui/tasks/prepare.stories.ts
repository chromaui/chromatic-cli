import frames from './prepare.frames?clack';

export default {
  title: 'CLI/Tasks/Prepare',
};

export const Validating = () => frames.Validating;
export const Invalid = () => frames.Invalid;
export const InvalidAndroidArtifact = () => frames.InvalidAndroidArtifact;
export const InvalidReactNativeAndroidMissing = () => frames.InvalidReactNativeAndroidMissing;
export const InvalidReactNativeIosMissing = () => frames.InvalidReactNativeIosMissing;
export const InvalidReactNativeBothMissing = () => frames.InvalidReactNativeBothMissing;
export const Tracing = () => frames.Tracing;
export const BailedPackageFile = () => frames.BailedPackageFile;
export const BailedLockfile = () => frames.BailedLockfile;
export const BailedSiblings = () => frames.BailedSiblings;
export const Traced = () => frames.Traced;
export const Hashing = () => frames.Hashing;
export const Success = () => frames.Success;
