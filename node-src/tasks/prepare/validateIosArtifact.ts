import path from 'path';
import { readFileSync } from 'simple-plist';

import { invalidIosArtifact } from '../../ui/tasks/prepare';

export interface ValidateIosArtifactInput {
  sourceDir: string;
  browsers?: string[];
}

// Any key can hold any plist type, so check the type of each value before using it.
type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | PlistValue[]
  | { [key: string]: PlistValue };

interface InfoPlist {
  CFBundleSupportedPlatforms?: PlistValue;
  DTPlatformName?: PlistValue;
  UIDeviceFamily?: PlistValue;
}

const SIMULATOR_PLATFORM = 'iPhoneSimulator';

// DTPlatformName spells platforms in lower case; name them the way CFBundleSupportedPlatforms does.
const PLATFORM_NAMES: Record<string, string> = {
  iphoneos: 'iPhoneOS',
  iphonesimulator: SIMULATOR_PLATFORM,
};

const IPHONE_FAMILY = 1;

const FAMILY_NAMES: Record<number, string> = {
  2: 'iPad',
  3: 'Apple TV',
  4: 'Apple Watch',
  6: 'Mac',
  7: 'Apple Vision',
};

/**
 * The platforms the app was built for when none of them is the iOS simulator, or undefined when it
 * runs on the simulator or names no platform. CFBundleSupportedPlatforms is what the installer
 * checks, so DTPlatformName is only a fallback.
 *
 * @param plist The parsed Info.plist.
 *
 * @returns A comma-separated list of platforms, or undefined.
 */
function devicePlatform(plist: InfoPlist) {
  let platforms = Array.isArray(plist.CFBundleSupportedPlatforms)
    ? plist.CFBundleSupportedPlatforms.filter((platform) => typeof platform === 'string')
    : [];
  if (platforms.length === 0 && typeof plist.DTPlatformName === 'string' && plist.DTPlatformName) {
    platforms = [PLATFORM_NAMES[plist.DTPlatformName] ?? plist.DTPlatformName];
  }
  if (platforms.length === 0) return undefined;
  if (platforms.some((platform) => platform.toLowerCase() === SIMULATOR_PLATFORM.toLowerCase())) {
    return undefined;
  }
  return platforms.join(', ');
}

/**
 * The device families the app supports when iPhone is not one of them, or undefined when it runs on
 * iPhone. An app without UIDeviceFamily runs on iPhone only.
 *
 * @param plist The parsed Info.plist.
 *
 * @returns A comma-separated list of device families, or undefined.
 */
function nonIPhoneFamilies(plist: InfoPlist) {
  const families = Array.isArray(plist.UIDeviceFamily)
    ? plist.UIDeviceFamily.map(Number).filter((family) => Number.isInteger(family))
    : [];
  if (families.length === 0 || families.includes(IPHONE_FAMILY)) return undefined;
  return families.map((family) => FAMILY_NAMES[family] ?? `device family ${family}`).join(', ');
}

/**
 * Validates that the iOS app can be installed on an iPhone simulator. Chromatic captures iOS
 * stories on iPhone simulators, so the app must be a simulator build that supports iPhone.
 *
 * @param input - The source directory and the build's enabled browsers.
 *
 * @throws {Error} if the app was built for a device, or does not support iPhone
 */
export async function validateIosArtifact(input: ValidateIosArtifactInput) {
  if (!input.browsers?.includes('ios')) return;

  let plist: InfoPlist;
  try {
    plist = readFileSync<InfoPlist>(path.join(input.sourceDir, 'storybook.app', 'Info.plist'));
  } catch {
    // A missing or unreadable Info.plist is left to the install to report.
    return;
  }

  const platform = devicePlatform(plist);
  if (platform) {
    throw new Error(invalidIosArtifact({ platform }).output);
  }

  const families = nonIPhoneFamilies(plist);
  if (families) {
    throw new Error(invalidIosArtifact({ families }).output);
  }
}
