import { execa, parseCommandString } from 'execa';
import { writeFile } from 'jsonfile';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addChromaticScript, installReactNativeDependencies, writeChromaticConfig } from './setup';

vi.mock('jsonfile', async (importOriginal) => {
  return {
    // @ts-expect-error TS does not think actual is an object, but it's fine.
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

describe('addChromaticScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds chromatic script to package.json', async () => {
    await addChromaticScript({}, './package.json');
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      './package.json',
      {
        scripts: {
          chromatic: 'chromatic',
        },
      },
      { spaces: 2 }
    );
  });

  it('preserves existing scripts when adding chromatic', async () => {
    await addChromaticScript({ scripts: { build: 'tsc', test: 'vitest' } }, './package.json');
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      './package.json',
      {
        scripts: {
          build: 'tsc',
          test: 'vitest',
          chromatic: 'chromatic',
        },
      },
      { spaces: 2 }
    );
  });
});

describe('writeChromaticConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes config with storybookConfigDir', async () => {
    await writeChromaticConfig('chromatic.config.json', '.rnstorybook');
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      'chromatic.config.json',
      { storybookConfigDir: '.rnstorybook' },
      { spaces: 2 }
    );
  });

  it('writes config with custom config directory', async () => {
    await writeChromaticConfig('chromatic.config.json', '.storybook');
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      'chromatic.config.json',
      { storybookConfigDir: '.storybook' },
      { spaces: 2 }
    );
  });
});

describe('installReactNativeDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs dependencies with latest version', async () => {
    await installReactNativeDependencies('latest');

    const installCommand =
      'yarn add -D chromatic @storybook/react-native@latest @chromatic-com/storybook-native@latest';
    const [command, ...arguments_] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(command, arguments_, { shell: true });
  });

  it('installs dependencies with a specific version', async () => {
    await installReactNativeDependencies('8.0.0');

    const installCommand =
      'yarn add -D chromatic @storybook/react-native@8.0.0 @chromatic-com/storybook-native@8.0.0';
    const [command, ...arguments_] = parseCommandString(installCommand);

    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith(command, arguments_, { shell: true });
  });
});
