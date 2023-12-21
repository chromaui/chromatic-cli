import { execaCommand } from "execa"
import { writeFile } from "jsonfile";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TestFramework, addChromaticScriptToPackageJson, createChromaticConfigFile, installArchiveDependencies } from "./init";

vi.mock('jsonfile', async (importOriginal) => {
    return {
        // @ts-expect-error TS does not think actual is an object, but it's fine.
        ...await importOriginal(),
        writeFile: vi.fn(() => Promise.resolve()),
    };
});

vi.mock('execa');
vi.mock('find-up', async (importOriginal) => {
    return {
        // @ts-expect-error TS does not think actual is an object, but it's fine.
        ...await importOriginal(),
        findUp: vi.fn(() => Promise.resolve('./main.ts')),
    };
});

describe('addChromaticScriptToPackageJson', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })
    it('outputs updated package.json with only chromatic script if Framework is Storybook', async () => {
        await addChromaticScriptToPackageJson({
            testFramework: TestFramework.STORYBOOK,
            packageJson: {},
            packagePath: './package.json'
        })
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('./package.json', {
            scripts: {
                chromatic: `npx chromatic`
            }
        }, { spaces: 2 })
    })

    it('outputs updated package.json with e2e script if Framework is not Storybook', async () => {
        await addChromaticScriptToPackageJson({
            testFramework: TestFramework.PLAYWRIGHT,
            packageJson: {},
            packagePath: './package.json'
        })
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('./package.json', {
            scripts: {
                'build-e2e-storybook': "archive-storybook",
                chromatic: `npx chromatic`
            }
        }, { spaces: 2 })
    })
})

describe('createChromaticConfigFile', () => {
    it('outputs file without buildScriptName when not passed one', async () => {
        await createChromaticConfigFile({configFile: 'chromatic.config.json'})
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('chromatic.config.json', {
            autoAcceptChanges: "main",
            onlyChanged: true,
            skip: "dependabot/**"
        })
    })
})

describe('installArchiveDependencies', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })
    it('successfully installs complete list of dependencies if SB package is not found and SB config is not found', async () => {
        await installArchiveDependencies({})
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D @chromaui/test-archiver @chromaui/archive-storybook storybook @storybook/addon-essentials @storybook/server-webpack5 react react-dom')
    })
    it('successfully installs complete list of dependencies if SB package is found and SB config is not found', async () => {
        vi.mock('find-up', async (importOriginal) => {
            return {
                // @ts-expect-error TS does not think actual is an object, but it's fine.
                ...await importOriginal(),
                findUp: vi.fn(() => Promise.resolve('')),
            };
        });
        await installArchiveDependencies({devDependencies: {'storybook': 'latest'}})
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D @chromaui/test-archiver @chromaui/archive-storybook storybook @storybook/addon-essentials @storybook/server-webpack5 react react-dom')
        vi.resetAllMocks()
    })
    it('successfully installs complete list of dependencies if SB package is found and SB config is not found', async () => {
        await installArchiveDependencies({devDependencies: {storybook: 'latest'}})
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D @chromaui/test-archiver @chromaui/archive-storybook @storybook/server-webpack5@latest')
    })
})