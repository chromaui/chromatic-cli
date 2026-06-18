import { fallbackFailureState } from '../../renderer/engine';
import { clackSpinnerRenderer } from '../../renderer/engine/clack/spinnerRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import {
  failedNoValidPlatforms,
  pending,
  pendingAndroid,
  pendingIOS,
  pendingManifest,
  skipped,
  success,
} from './buildReactNative';

// Node-side scenarios for the React Native build, rendered through the real Clack spinner renderer.
// The platform/manifest states are mid-run updates (`deps.report`); failures render the engine's
// fallback failure state, since build registers no `failure` transition.

const reactNativeBuildLogFile =
  '/users/me/project/storybook-static/.chromatic/react-native-build.log';

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

export const Building = () => make(pending());

export const BuildingAndroid = () => make(pendingAndroid(), pending());

export const BuildingAndroidWithCommand = () =>
  make(pendingAndroid({ androidBuildCommand: 'my-android-build' } as any), pending());

export const BuildingIOS = () => make(pendingIOS(), pending());

export const BuildingIOSWithCommand = () =>
  make(pendingIOS({ iosBuildCommand: 'my-ios-build' } as any), pending());

export const GeneratingManifest = () => make(pendingManifest(), pending());

export const Built = () =>
  make(
    success({ options: {}, now: 0, startedAt: -32_100, reactNativeBuildLogFile } as any),
    pending()
  );

export const Skipped = () => make(skipped(), pending());

export const NoValidPlatforms = () =>
  make(
    fallbackFailureState(pending().title, new Error(failedNoValidPlatforms().output)),
    pending()
  );

export const Failed = () =>
  make(
    fallbackFailureState(
      pending().title,
      new Error(`Build failed, see logs at ${reactNativeBuildLogFile}`)
    ),
    pending()
  );
