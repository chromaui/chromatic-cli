import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';

import { readFile } from 'jsonfile';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock('jsonfile', async (importOriginal) => {
  return {
    // @ts-expect-error TS does not think actual is an object, but it's fine.
    ...(await importOriginal()),
    readFile: vi.fn(() =>
      Promise.resolve({
        addons: {
          '@storybook/addon-essentials': { version: '8.1.0' },
          '@storybook/addon-links': { version: '8.1.0' },
        },
        builder: 'webpack5',
        framework: { name: 'react' },
        storybookVersion: '8.1.0',
        storybookPackages: {
          '@storybook/react': { version: '8.1.0' },
          '@storybook/builder-webpack5': { version: '8.1.0' },
          '@storybook/addon-essentials': { version: '8.1.0' },
          '@storybook/addon-links': { version: '8.1.0' },
        },
      })
    ),
  };
});

describe('getStorybookMetadataFromProjectJson', () => {
  it('should return the metadata from the project.json file', async () => {
    const projectJsonPath = 'path/to/project.json';
    const metadata = await getStorybookMetadataFromProjectJson(projectJsonPath);

    expect(metadata).toEqual({
      viewLayer: 'react',
      version: '8.1.0',
      builder: {
        name: 'webpack5',
        packageVersion: '8.1.0',
      },
      addons: [
        {
          name: 'essentials',
          packageName: '@storybook/addon-essentials',
          packageVersion: '8.1.0',
        },
        {
          name: 'links',
          packageName: '@storybook/addon-links',
          packageVersion: '8.1.0',
        },
      ],
    });
    expect(readFile).toHaveBeenCalledWith(projectJsonPath);
  });
});
