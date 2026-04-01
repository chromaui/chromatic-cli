import { getCliCommand, parseNi } from '@antfu/ni';
import boxen from 'boxen';
import chalk from 'chalk';
import { execa, parseCommandString } from 'execa';
import { writeFile } from 'jsonfile';
import meow from 'meow';
import prompts from 'prompts';
import { readPackageUp } from 'read-package-up';

import {
  detectReactNativeProject,
  type ReactNativeProjectInfo,
} from '../node-src/lib/react-native/detect';
import noPackageJson from '../node-src/ui/messages/errors/noPackageJson';

const getPackageManagerInstallCommand = async (arguments_: string[]) => {
  return getCliCommand(parseNi, arguments_, { programmatic: true });
};

/**
 * Install React Native Storybook dependencies using the project's package manager.
 *
 * @param storybookVersion - The version of `@storybook/react-native` to install, or 'latest'.
 */
export async function installReactNativeDependencies(storybookVersion: string) {
  const installArguments = [
    '-D',
    'chromatic',
    `@storybook/react-native@${storybookVersion}`,
    `@chromatic-com/storybook-native@${storybookVersion}`,
  ];

  const installCommand = await getPackageManagerInstallCommand(installArguments);
  if (!installCommand) {
    throw new Error('Could not determine package manager.');
  }

  const [command, ...arguments_] = parseCommandString(installCommand);
  await execa(command, arguments_, { shell: true });
}

/**
 * Add the `chromatic` script to package.json.
 *
 * @param packageJson - The parsed package.json object.
 * @param packagePath - The file path to package.json.
 */
export async function addChromaticScript(packageJson: Record<string, any>, packagePath: string) {
  const json = {
    ...packageJson,
    scripts: {
      ...packageJson?.scripts,
      chromatic: 'chromatic',
    },
  };
  await writeFile(packagePath, json, { spaces: 2 });
}

/**
 * Write a chromatic.config.json file with React Native configuration.
 *
 * @param configFile - The path to write the config file to.
 * @param storybookConfigDirectory - The Storybook config directory path.
 */
export async function writeChromaticConfig(configFile: string, storybookConfigDirectory: string) {
  const configData: Record<string, string> = {
    storybookConfigDir: storybookConfigDirectory,
  };
  await writeFile(configFile, configData, { spaces: 2 });
}

/**
 * Print detected project information to the console.
 *
 * @param projectInfo - The detected React Native project info.
 */
function printDetectedInfo(projectInfo: ReactNativeProjectInfo) {
  console.log(chalk.green('  ✓ React Native project detected'));
  if (projectInfo.isExpo) {
    console.log(chalk.green('  ✓ Expo project detected'));
  }
  if (projectInfo.hasExpoRouter) {
    console.log(chalk.green('  ✓ expo-router detected'));
  }
  if (projectInfo.appName) {
    console.log(chalk.green(`  ✓ App name: ${projectInfo.appName}`));
  }
  if (projectInfo.storybookConfigDirectory) {
    console.log(chalk.green(`  ✓ Storybook config: ${projectInfo.storybookConfigDirectory}/`));
  }
  if (projectInfo.iosWorkspacePath) {
    console.log(chalk.green(`  ✓ iOS workspace: ${projectInfo.iosWorkspacePath}`));
  }
  if (projectInfo.iosScheme) {
    console.log(chalk.green(`  ✓ iOS scheme: ${projectInfo.iosScheme}`));
  }
}

/**
 * Prompt user for any missing configuration values.
 *
 * @param projectInfo - The detected project info.
 * @param skipPrompts - Whether to skip interactive prompts.
 *
 * @returns The resolved storybook config directory and storybook version.
 */
async function gatherConfiguration(
  projectInfo: ReactNativeProjectInfo,
  skipPrompts: boolean
): Promise<{ storybookConfigDirectory: string; storybookVersion: string }> {
  let storybookConfigDirectory = projectInfo.storybookConfigDirectory ?? '.rnstorybook';
  let storybookVersion = 'latest';

  if (!skipPrompts) {
    const answers = await prompts([
      {
        type: projectInfo.storybookConfigDirectory ? undefined : 'text',
        name: 'storybookConfigDirectory',
        message: 'Where is your Storybook config directory?',
        initial: '.rnstorybook',
      },
      {
        type: 'text',
        name: 'storybookVersion',
        message: 'Which @storybook/react-native version do you want to install?',
        initial: 'latest',
      },
    ]);

    storybookConfigDirectory = answers.storybookConfigDirectory || storybookConfigDirectory;
    storybookVersion = answers.storybookVersion || storybookVersion;
  }

  return { storybookConfigDirectory, storybookVersion };
}

/**
 * Apply the setup steps: install deps, update package.json, write config.
 *
 * @param packagePath - Path to the project's package.json.
 * @param packageJson - The parsed package.json object.
 * @param storybookConfigDirectory - The Storybook config directory.
 * @param storybookVersion - The version of storybook packages to install.
 */
async function applySetup(
  packagePath: string,
  packageJson: Record<string, any>,
  storybookConfigDirectory: string,
  storybookVersion: string
) {
  console.log(chalk.cyan('\n📦 Installing dependencies...\n'));
  await installReactNativeDependencies(storybookVersion);
  console.log(chalk.green('  ✓ Dependencies installed'));

  console.log(chalk.cyan('\n📝 Updating package.json...\n'));
  const writablePackageJson = { ...packageJson } as Record<string, any>;
  delete writablePackageJson.readme;
  delete writablePackageJson._id;
  await addChromaticScript(writablePackageJson, packagePath);
  console.log(chalk.green('  ✓ Added "chromatic" script to package.json'));

  console.log(chalk.cyan('\n⚙️  Writing chromatic.config.json...\n'));
  await writeChromaticConfig('chromatic.config.json', storybookConfigDirectory);
  console.log(chalk.green('  ✓ Created chromatic.config.json'));
}

/**
 * The main entrypoint for `chromatic setup`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags } = meow(
    `
      Usage
        $ chromatic setup

      Options
        --skip-prompts    Skip interactive prompts and use detected/default values
    `,
    {
      argv,
      description: 'Setup Chromatic for a React Native project',
      flags: {
        skipPrompts: {
          type: 'boolean',
          default: false,
        },
      },
    }
  );

  console.log(
    boxen(
      'Welcome to Chromatic Setup! This CLI will help configure Chromatic for your React Native project.',
      {
        title: 'Chromatic Setup',
        titleAlignment: 'center',
        textAlignment: 'center',
        padding: 1,
        borderStyle: 'double',
        borderColor: '#FF4400',
      }
    )
  );

  try {
    const packageInfo = await readPackageUp({ cwd: process.cwd() });
    if (!packageInfo) {
      console.error(noPackageJson());
      process.exit(253);
    }

    const { path: packagePath, packageJson } = packageInfo;
    const projectRoot = packagePath.replace(/\/package\.json$/, '');

    console.log(chalk.cyan('\n🔍 Detecting project configuration...\n'));
    const projectInfo = detectReactNativeProject(projectRoot);

    if (!projectInfo.isReactNative) {
      console.log(
        chalk.yellow(
          'This does not appear to be a React Native project. Please use `chromatic init` instead.'
        )
      );
      return;
    }

    printDetectedInfo(projectInfo);

    const { storybookConfigDirectory, storybookVersion } = await gatherConfiguration(
      projectInfo,
      flags.skipPrompts
    );

    await applySetup(
      packagePath,
      packageJson as Record<string, any>,
      storybookConfigDirectory,
      storybookVersion
    );

    console.log(
      boxen(
        chalk`Setup complete! Next steps:
  1. Run {cyan npx chromatic} to start your first build
  2. Visit {underline https://www.chromatic.com/docs/react-native} for more details`,
        {
          title: 'Done!',
          titleAlignment: 'center',
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
  } catch (error) {
    console.error(chalk.red(`\nSetup failed: ${error}`));
    process.exit(1);
  }
}
