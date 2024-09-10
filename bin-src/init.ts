import { getCliCommand, parseNi } from '@antfu/ni';
import boxen from 'boxen';
import { execaCommand } from 'execa';
import { writeFile } from 'jsonfile';
import meow from 'meow';
import prompts from 'prompts';
import type { PackageJson } from 'read-pkg-up';
import readPkgUp from 'read-pkg-up';

import noPackageJson from '../node-src/ui/messages/errors/noPackageJson';

export const TestFramework = {
  STORYBOOK: 'storybook',
  PLAYWRIGHT: 'playwright',
  CYPRESS: 'cypress',
};
type TestFrameworkType = (typeof TestFramework)[keyof typeof TestFramework];

export const getPackageManagerInstallCommand = async (args: string[]) => {
  return await getCliCommand(parseNi, args, { programmatic: true });
};

export const addChromaticScriptToPackageJson = async ({ packageJson, packagePath }) => {
  try {
    const json = {
      ...packageJson,
      scripts: {
        ...packageJson?.scripts,
        chromatic: `chromatic`,
      },
    };
    await writeFile(packagePath, json, { spaces: 2 });
  } catch (e) {
    console.warn(e);
  }
};

export const createChromaticConfigFile = async ({ configFile, buildScriptName = null }) => {
  await writeFile(configFile, {
    ...(buildScriptName && {
      buildScriptName,
    }),
  });
};

export const getStorybookPackages = (pkgJson: PackageJson) => {
  const storybookVersion = pkgJson?.devDependencies?.storybook || pkgJson?.dependencies?.storybook;
  const essentialsVersion =
    pkgJson?.devDependencies?.['@storybook/addon-essentials'] ||
    pkgJson?.dependencies?.['@storybook/addon-essentials'];
  if (storybookVersion && essentialsVersion) {
    return [`@storybook/server-webpack5@${storybookVersion}`];
  }
  if (storybookVersion && !essentialsVersion) {
    return [
      `@storybook/addon-essentials@${storybookVersion}`,
      `@storybook/server-webpack5@${storybookVersion}`,
    ];
  }
  if (!storybookVersion && essentialsVersion) {
    return [`storybook@${essentialsVersion}`, `@storybook/server-webpack5@${essentialsVersion}`];
  }
  return [
    'storybook@latest',
    '@storybook/addon-essentials@latest',
    '@storybook/server-webpack5@latest',
  ];
};

export const installArchiveDependencies = async (
  packageJson: PackageJson,
  testFramework: TestFrameworkType
) => {
  const defaultInstallArgs = ['-D', 'chromatic', `@chromatic-com/${testFramework}`];
  const sbPackages = getStorybookPackages(packageJson);
  const installArgs = [...defaultInstallArgs, ...sbPackages];
  const installCommand = await getPackageManagerInstallCommand(installArgs);
  await execaCommand(installCommand);
};

const intializeChromatic = async ({
  testFramework,
  packageJson,
  packagePath,
}: {
  testFramework: TestFrameworkType;
  packageJson: PackageJson;
  packagePath: string;
}) => {
  await addChromaticScriptToPackageJson({ packageJson, packagePath });
  //await createChromaticConfigFile({configFile: 'chromatic.config.json'})
  switch (testFramework) {
    case TestFramework.CYPRESS:
      await installArchiveDependencies(packageJson, TestFramework.CYPRESS);
      break;
    case TestFramework.PLAYWRIGHT:
      await installArchiveDependencies(packageJson, TestFramework.PLAYWRIGHT);
      break;

    default:
      break;
  }
};

export async function main(argv: string[]) {
  const { flags } = meow(
    `
        Usage
          $ chromatic init [-f|--framework]

        Options
          --framework, -f <framework     Test Framework that you are aiming to use with Chromatic. (default: 'storybook')
        `,
    {
      argv,
      description: 'Utility for setting up Chromatic',
      flags: {
        framework: {
          type: 'string',
          alias: 'f',
        },
      },
    }
  );
  console.log(
    boxen(
      'Welcome to Chromatic Initialization tool! This CLI will help get Chromatic setup within your project.',
      {
        title: 'Chromatic Init',
        titleAlignment: 'center',
        textAlignment: 'center',
        padding: 1,
        borderStyle: 'double',
        borderColor: '#FF4400',
      }
    )
  );

  try {
    const pkgInfo = await readPkgUp({ cwd: process.cwd() });
    if (!pkgInfo) {
      console.error(noPackageJson());
      process.exit(253);
    }

    const { path: packagePath, packageJson } = pkgInfo;
    const { testFramework } = await prompts([
      {
        type: flags.framework ? null : 'select',
        name: 'testFramework',
        message: 'What testing framework are you using?',
        choices: [
          { title: 'Storybook', value: TestFramework.STORYBOOK },
          { title: 'Playwright', value: TestFramework.PLAYWRIGHT },
          { title: 'Cypress', value: TestFramework.CYPRESS },
        ],
        initial: 0,
      },
    ]);
    const { readme, _id, ...rest } = packageJson;
    await intializeChromatic({
      testFramework: testFramework || flags.framework,
      packageJson: rest,
      packagePath,
    });
  } catch (err) {
    console.error(err);
  }
}
