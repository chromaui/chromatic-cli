import boxen from "boxen";
import {writeFile} from 'jsonfile';
import prompts from 'prompts';
import readPkgUp from 'read-pkg-up';

import type { Configuration } from "../node-src/types";
import noPackageJson from '../node-src/ui/messages/errors/noPackageJson';

const TestFrameworkType = {
    STORYBOOK: 'storybook',
    PLAYWRIGHT: 'playwright',
    CYPRESS: 'cypress'
};

const addChromaticScriptToPackageJson = async ({testFramework, packageJson, packagePath}) => {
    try {
        const json = {
            ...packageJson,
            scripts: {
                ...packageJson?.scripts,
                ...(testFramework !== TestFrameworkType.STORYBOOK && {
                    'build-e2e-storybook': "archive-storybook"
                }),
                chromaticTest: `npx chromatic`
            }
        }
        await writeFile(packagePath, json, { spaces: 2 });
    } catch (e) {
        console.warn(e)
    }
}

const createChromaticConfigFile = async (configFile: string, configuration: Configuration) => {
    await writeFile(configFile, configuration);
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
                {title: 'Storybook', value: TestFrameworkType.STORYBOOK},
                {title: 'Playwright', value: TestFrameworkType.PLAYWRIGHT},
                {title: 'Cypress', value: TestFrameworkType.CYPRESS},
            ],
            initial: 0
        },
        {
            type:  "text",
            name: 'buildScriptName',
            message: "What is the name of the NPM script that builds your Storybook? (default: build-storybook)",
            initial: (_, {testFramework}) => testFramework === TestFrameworkType.STORYBOOK ? 'build-storybook' : 'build-e2e-storybook'
        }
    ])
    const {readme, _id, ...rest} = packageJson
    await addChromaticScriptToPackageJson({packageJson:rest, packagePath, testFramework});
    await createChromaticConfigFile('chromatic.config.json', {
        autoAcceptChanges: "main",
        ...(buildScriptName && {
            buildScriptName
        }),
        exitOnceUploaded: true, // TODO: Only enable this option by default if project is linked.
        externals: ["public/**"],
        onlyChanged: true,
        skip: "dependabot/**"
    })
}