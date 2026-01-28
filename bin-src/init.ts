import { getCliCommand, parseNi } from '@antfu/ni';
import boxen from 'boxen';
import { execa, parseCommandString } from 'execa';
import { Path, writeFile } from 'jsonfile';
import meow from 'meow';
import prompts from 'prompts';
import type { NormalizedPackageJson } from 'read-package-up';
import { readPackageUp } from 'read-package-up';

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
  } catch (err) {
    console.warn(err);
  }
};

export const createChromaticConfigFile = async ({
  configFile,
  buildScriptName = undefined,
}: {
  configFile: Path;
  buildScriptName?: string;
}) => {
  await writeFile(configFile, {
    ...(buildScriptName && {
      buildScriptName,
    }),
  });
};

// TODO: refactor this function
// eslint-disable-next-line complexity
export const getStorybookPackages = (pkgJson: NormalizedPackageJson) => {
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
  packageJson: NormalizedPackageJson,
  testFramework: TestFrameworkType
) => {
  const defaultInstallArguments = ['-D', 'chromatic', `@chromatic-com/${testFramework}`];
  const sbPackages = getStorybookPackages(packageJson);
  const installArguments = [...defaultInstallArguments, ...sbPackages];
  const installCommand = await getPackageManagerInstallCommand(installArguments);
  if (!installCommand) {
    throw new Error('Could not determine package manager.');
  }

  const [cmd, ...args] = parseCommandString(installCommand);
  await execa(cmd, args, { shell: true });
};

const intializeChromatic = async ({
  testFramework,
  packageJson,
  packagePath,
}: {
  testFramework: TestFrameworkType;
  packageJson: NormalizedPackageJson;
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

/**
 * The main entrypoint for `chromatic init`.
 *
 * @param argv A list of arguments passed.
 */
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
    const pkgInfo = await readPackageUp({ cwd: process.cwd() });
    if (!pkgInfo) {
      console.error(noPackageJson());
      process.exit(253);
    }

    const { path: packagePath, packageJson } = pkgInfo;
    const { testFramework } = await prompts([
      {
        type: flags.framework ? undefined : 'select',
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

    packageJson.readme = '';
    packageJson._id = '';

    await intializeChromatic({
      testFramework: testFramework || flags.framework,
      packageJson,
      packagePath,
    });
  } catch (err) {
    console.error(err);
  }
}
