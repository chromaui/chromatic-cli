import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ platform, errorMessage }: { platform: string; errorMessage: string }) => {
  return dedent(chalk`
    ${error} {bold React Native ${platform} build failed}

    ${errorMessage}

    Troubleshooting:
    ${
      platform === 'ios'
        ? dedent`
          - Make sure Xcode is installed and the iOS simulator SDK is available
          - Try running the build command manually to see detailed errors
          - Check that CODE_SIGNING_ALLOWED=NO is set (simulator builds don't need signing)
          - Try running 'pod install' in the ios/ directory
        `
        : dedent`
          - Make sure the Android SDK is installed
          - Try running './gradlew assembleRelease' in the android/ directory manually
          - Check that ANDROID_HOME or ANDROID_SDK_ROOT is set
        `
    }
  `);
};
