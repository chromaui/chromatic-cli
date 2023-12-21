import boxen from "boxen";
import { execaCommand } from 'execa';
import { findUp } from 'find-up';
import { writeFile } from 'jsonfile';
import prompts from 'prompts';
import type { PackageJson } from 'read-pkg-up'
import readPkgUp from 'read-pkg-up';
import { getCliCommand, parseNi } from '@antfu/ni';

import noPackageJson from '../node-src/ui/messages/errors/noPackageJson';

export const TestFramework = {
    STORYBOOK: 'storybook',
    PLAYWRIGHT: 'playwright',
    CYPRESS: 'cypress'
};
type TestFrameworkType = typeof TestFramework[keyof typeof TestFramework];

export const getPackageManagerInstallCommand = async (args: string[]) => {
    return await getCliCommand(parseNi, args, { programmatic: true });
};

const getSBConfigFilePath = async () => {
    // Walks up directory tree to find nearest Storybook config file.
    return await findUp(['.storybook/main.ts', '.storybook/main.js', '.storybook/main.tsx', '.storybook/main.jsx', '.storybook/main.mjs', '.storybook/main.cjs'])
}

export const addChromaticScriptToPackageJson = async ({testFramework, packageJson, packagePath}) => {
    try {
        const json = {
            ...packageJson,
            scripts: {
                ...packageJson?.scripts,
                ...(testFramework !== TestFramework.STORYBOOK && {
                    'build-e2e-storybook': "archive-storybook"
                }),
                chromatic: `npx chromatic`
            }
        }
        await writeFile(packagePath, json, { spaces: 2 });
    } catch (e) {
        console.warn(e)
    }
}

export const createChromaticConfigFile = async ({configFile, buildScriptName = null}) => {
    await writeFile(configFile, {
        autoAcceptChanges: "main",
        ...(buildScriptName && {
            buildScriptName
        }),
        onlyChanged: true,
        skip: "dependabot/**"
    });
}

export const installArchiveDependencies = async (packageJson: PackageJson) => {
    let installArgs = ['-D', '@chromaui/test-archiver', '@chromaui/archive-storybook', 'storybook', '@storybook/addon-essentials', '@storybook/server-webpack5', 'react', 'react-dom']
    const sbConfigPath = await getSBConfigFilePath()
    const sbVersion = packageJson?.devDependencies?.storybook || packageJson?.dependencies?.storybook
    console.log('sbConfigPath', sbConfigPath)
    console.log('sbVersion', sbVersion)
    if(sbConfigPath && sbVersion ) {
        installArgs = ['-D', '@chromaui/test-archiver', '@chromaui/archive-storybook', `@storybook/server-webpack5@${sbVersion}`]
    }
    const installCommand = await getPackageManagerInstallCommand(installArgs)
    await execaCommand(installCommand)
}

const intializeChromatic = async ({testFramework, packageJson, packagePath, buildScriptName}: {testFramework: TestFrameworkType, packageJson: PackageJson, packagePath: string, buildScriptName?: string }) => {
    switch (testFramework) {
        case TestFramework.CYPRESS:
        case TestFramework.PLAYWRIGHT:
            await addChromaticScriptToPackageJson({packageJson, packagePath, testFramework});
            await createChromaticConfigFile({configFile: 'chromatic.config.json', buildScriptName: 'build-e2e-storybook'})
            await installArchiveDependencies(packageJson)
            break;
        
        case TestFramework.STORYBOOK:
            await addChromaticScriptToPackageJson({packageJson, packagePath, testFramework});
            await createChromaticConfigFile({configFile: 'chromatic.config.json', buildScriptName})
            break;
    
        default:
            break;
    }
}

export async function main() {
    console.log(
        boxen('Welcome to Chromatic Initialization tool! This CLI will help get Chromatic setup within your project.', {
            title: 'Chromatic Init',
            titleAlignment: 'center',
            textAlignment: 'center',
            padding: 1,
            borderStyle: 'double',
            borderColor: '#FF4400',
        })
    )

    const pkgInfo = await readPkgUp({ cwd: process.cwd() });
    if (!pkgInfo) {
        console.error(noPackageJson());
        process.exit(253);
    }

    const { path: packagePath, packageJson } = pkgInfo;
    const { testFramework, buildScriptName } = await prompts([
        {
            type: 'select',
            name: 'testFramework',
            message: 'What testing framework are you using?',
            choices: [
                {title: 'Storybook', value: TestFramework.STORYBOOK},
                {title: 'Playwright', value: TestFramework.PLAYWRIGHT},
                {title: 'Cypress', value: TestFramework.CYPRESS},
            ],
            initial: 0
        },
        {
            type:  (_ , {testFramework}) => testFramework === TestFramework.STORYBOOK ? "text" : null,
            name: 'buildScriptName',
            message: "What is the name of the NPM script that builds your Storybook? (default: build-storybook)",
            initial: 'build-storybook'
        }
    ])
    const { readme, _id, ...rest } = packageJson
    await intializeChromatic({
        buildScriptName,
        testFramework, 
        packageJson: rest, 
        packagePath
    })
}