import { execaCommand } from "execa"
import { writeFile } from "jsonfile";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addChromaticScriptToPackageJson, createChromaticConfigFile, installArchiveDependencies } from "./init";
import { beforeEach } from "node:test";

vi.mock('jsonfile', async (importOriginal) => {
    return {
        // @ts-expect-error TS does not think actual is an object, but it's fine.
        ...await importOriginal(),
        writeFile: vi.fn(() => Promise.resolve()),
    };
});

vi.mock('execa');

describe('addChromaticScriptToPackageJson', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })
    it('outputs updated package.json with only chromatic script if Framework is Storybook', async () => {
        await addChromaticScriptToPackageJson({
            packageJson: {},
            packagePath: './package.json'
        })
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('./package.json', {
            scripts: {
                chromatic: `npx chromatic@latest`
            }
        }, { spaces: 2 })
    })

    it('outputs updated package.json with e2e script if Framework is not Storybook', async () => {
        await addChromaticScriptToPackageJson({
            packageJson: {},
            packagePath: './package.json'
        })
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('./package.json', {
            scripts: {
                chromatic: `npx chromatic@latest`
            }
        }, { spaces: 2 })
    })
})

describe('createChromaticConfigFile', () => {
    it('outputs file without buildScriptName when not passed one', async () => {
        await createChromaticConfigFile({configFile: 'chromatic.config.json'})
        expect(writeFile).toHaveBeenCalledOnce()
        expect(writeFile).toHaveBeenCalledWith('chromatic.config.json', {
            skip: "dependabot/**"
        })
    })
})

describe('installArchiveDependencies', () => {
    beforeEach(() => {
        vi.doMock('find-up', async () => {
            return {
                findUp: vi.fn(() => Promise.resolve(undefined)),
            };
        });
    })
    afterEach(() => {
        vi.clearAllMocks()
        vi.resetModules()
    })
    it('successfully installs complete list of dependencies for Playwright if SB package is not found and Essentials is not found', async () => {
        await installArchiveDependencies({}, 'playwright')
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D chromatic chromatic-playwright storybook@next @storybook/addon-essentials@next @storybook/server-webpack5@next')
    })
    it('successfully installs complete list of dependencies for Cypress if SB package is not found and Essentials is not found', async () => {
        await installArchiveDependencies({}, 'cypress')
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D chromatic chromatic-cypress storybook@next @storybook/addon-essentials@next @storybook/server-webpack5@next')
    })
    it('successfully installs complete list of dependencies if SB package is found and Essentials is not found', async () => {
        await installArchiveDependencies({devDependencies: {'storybook': 'latest'}}, 'playwright')
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D chromatic chromatic-playwright storybook@next @storybook/addon-essentials@next @storybook/server-webpack5@next')
    })
    it('successfully installs smaller list of dependencies if SB package is found and Essentials is found in devDependencies', async () => {
        await installArchiveDependencies({devDependencies: {storybook: 'latest', '@storybook/addon-essentials': 'latest'}}, 'playwright')
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D chromatic chromatic-playwright @storybook/server-webpack5@latest')
        vi.clearAllMocks()
    })
    it('successfully installs smaller list of dependencies if SB package is found and Essentials is found in dependencies', async () => {
        await installArchiveDependencies({dependencies: {storybook: 'latest', '@storybook/addon-essentials': 'latest'}}, 'playwright')
        expect(execaCommand).toHaveBeenCalledOnce()
        expect(execaCommand).toHaveBeenCalledWith('yarn add -D chromatic chromatic-playwright @storybook/server-webpack5@latest')
        vi.clearAllMocks()
    })
})