import { execa, parseCommandString } from 'execa';
import { writeFile } from 'jsonfile';
import type { NormalizedPackageJson } from 'read-package-up';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addChromaticScriptToPackageJson,
  createChromaticConfigFile,
  installArchiveDependencies,
} from './init';

vi.mock('jsonfile', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    writeFile: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

describe('addChromaticScriptToPackageJson', () => {
  it('outputs updated package.json with only chromatic script if Framework is Storybook', async () => {
    await addChromaticScriptToPackageJson({
      packageJson: {},
      packagePath: './package.json',
    });
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      './package.json',
      {
        scripts: {
          chromatic: `chromatic`,
        },
      },
      { spaces: 2 }
    );
  });

  it('outputs updated package.json with e2e script if Framework is not Storybook', async () => {
    await addChromaticScriptToPackageJson({
      packageJson: {},
      packagePath: './package.json',
    });
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      './package.json',
      {
        scripts: {
          chromatic: `chromatic`,
        },
      },
      { spaces: 2 }
    );
  });
});

describe('createChromaticConfigFile', () => {
  it('outputs file without buildScriptName when not passed one', async () => {
    await createChromaticConfigFile({ configFile: 'chromatic.config.json' });
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith('chromatic.config.json', {});
  });
});

describe('installArchiveDependencies', () => {
  beforeEach(() => {
    vi.doMock('find-up', async () => {
      return {
        findUp: vi.fn(() => Promise.resolve(undefined)),
      };
    });
  });

  it('successfully installs list of dependencies for Playwright if SB package is not found and Essentials is not found', async () => {
    await installArchiveDependencies({} as NormalizedPackageJson, 'playwright');

    const installCommand =
      'yarn add -D chromatic @chromatic-com/playwright storybook@latest @storybook/addon-essentials@latest @storybook/server-webpack5@latest';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });

  it('successfully installs list of dependencies for Cypress if SB package is not found and Essentials is not found', async () => {
    await installArchiveDependencies({} as NormalizedPackageJson, 'cypress');

    const installCommand =
      'yarn add -D chromatic @chromatic-com/cypress storybook@latest @storybook/addon-essentials@latest @storybook/server-webpack5@latest';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });

  it('successfully installs list of dependencies if SB package is found and Essentials is not found', async () => {
    await installArchiveDependencies(
      // @ts-expect-error Ignore the intentionally missing properties
      { devDependencies: { storybook: '7.6.5' } } as NormalizedPackageJson,
      'playwright'
    );

    const installCommand =
      'yarn add -D chromatic @chromatic-com/playwright @storybook/addon-essentials@7.6.5 @storybook/server-webpack5@7.6.5';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });

  it('successfully installs list of dependencies if SB package is found and Essentials is found in devDependencies', async () => {
    await installArchiveDependencies(
      // @ts-expect-error Ignore the intentionally missing properties
      {
        devDependencies: { storybook: '7.6.5', '@storybook/addon-essentials': '7.6.5' },
      } as NormalizedPackageJson,
      'playwright'
    );

    const installCommand =
      'yarn add -D chromatic @chromatic-com/playwright @storybook/server-webpack5@7.6.5';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });

  it('successfully installs list of dependencies if SB package is found and Essentials is found in dependencies', async () => {
    await installArchiveDependencies(
      // @ts-expect-error Ignore the intentionally missing properties
      {
        dependencies: { storybook: '7.6.5', '@storybook/addon-essentials': '7.6.5' },
      } as NormalizedPackageJson,
      'playwright'
    );

    const installCommand =
      'yarn add -D chromatic @chromatic-com/playwright @storybook/server-webpack5@7.6.5';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });

  it('successfully installs list of dependencies if SB package is not found and Essentials is found in dependencies', async () => {
    await installArchiveDependencies(
      // @ts-expect-error Ignore the intentionally missing properties
      { dependencies: { '@storybook/addon-essentials': '7.6.5' } } as NormalizedPackageJson,
      'playwright'
    );

    const installCommand =
      'yarn add -D chromatic @chromatic-com/playwright storybook@7.6.5 @storybook/server-webpack5@7.6.5';
    const [cmd, ...args] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(cmd, args, { shell: true });
  });
});
