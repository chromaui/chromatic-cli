import task from '../components/task';
import {
  failed,
  failedNoValidPlatforms,
  initial,
  pending,
  pendingAndroid,
  pendingIOS,
  pendingManifest,
  skipped,
  success,
} from './buildReactNative';

export default {
  title: 'CLI/Tasks/Build/React Native',
  decorators: [(storyFunction) => task(storyFunction())],
};

const ctx = { options: {} } as any;

export const Initial = () => initial();

export const Building = () => pending();

export const BuildingAndroid = () => pendingAndroid();

export const BuildingAndroidWithCommand = () =>
  pendingAndroid({ androidBuildCommand: 'my-android-build' });

export const BuildingIOS = () => pendingIOS();

export const BuildingIOSWithCommand = () => pendingIOS({ iosBuildCommand: 'my-ios-build' });

export const GeneratingManifest = () => pendingManifest();

export const Built = () =>
  success({
    ...ctx,
    now: 0,
    startedAt: -32_100,
    reactNativeBuildLogFile: '/users/me/project/storybook-static/.chromatic/react-native-build.log',
  } as any);

export const Skipped = () => skipped();

export const NoValidPlatforms = () => failedNoValidPlatforms();

export const Failed = () =>
  failed({
    ...ctx,
    reactNativeBuildLogFile: '/users/me/project/storybook-static/.chromatic/react-native-build.log',
  } as any);
