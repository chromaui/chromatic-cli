import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';

import { describe, expect, it } from 'vitest';

describe('getStorybookMetadataFromProjectJson', () => {
  it('should return the metadata from the project.json file', async () => {
    const projectJsonPath = 'bin-src/__mocks__/normalProjectJson/project.json';
    const metadata = await getStorybookMetadataFromProjectJson(projectJsonPath);

    expect(metadata).toEqual({
      viewLayer: '@storybook/react-webpack5',
      version: '8.1.5',
      builder: {
        name: '@storybook/builder-webpack5',
        packageVersion: '8.1.5',
      },
      addons: [
        {
          name: 'essentials',
          packageName: '@storybook/addon-essentials',
          packageVersion: '8.1.5',
        },
        {
          name: 'compiler-swc',
          packageName: '@storybook/addon-webpack5-compiler-swc',
          packageVersion: '1.0.2',
        },
      ],
    });
  });

  it('should return the metadata from a Storybook 6 project.json file', async () => {
    const projectJsonPath = 'bin-src/__mocks__/sb6ProjectJson/project.json';
    const metadata = await getStorybookMetadataFromProjectJson(projectJsonPath);

    expect(metadata).toEqual({
      viewLayer: 'react',
      version: '6.5.16',
      builder: {
        name: 'webpack4',
        packageVersion: '6.5.16',
      },
      addons: [
        {
          name: 'links',
          packageName: '@storybook/addon-links',
          packageVersion: '6.5.16',
        },
        {
          name: 'essentials',
          packageName: '@storybook/addon-essentials',
          packageVersion: '6.5.16',
        },
        {
          name: 'interactions',
          packageName: '@storybook/addon-interactions',
          packageVersion: '6.5.16',
        },
      ],
    });
  });

  it('should return the metadata from the project.json file when the builder is missing', async () => {
    const projectJsonPath = 'bin-src/__mocks__/sb6ProjectJsonMissingBuilder/project.json';
    const metadata = await getStorybookMetadataFromProjectJson(projectJsonPath);

    expect(metadata).toEqual({
      viewLayer: 'react',
      version: '6.5.16',
      builder: {
        name: 'webpack4',
        packageVersion: '6.5.16',
      },
      addons: [
        {
          name: 'links',
          packageName: '@storybook/addon-links',
          packageVersion: '6.5.16',
        },
        {
          name: 'essentials',
          packageName: '@storybook/addon-essentials',
          packageVersion: '6.5.16',
        },
        {
          name: 'interactions',
          packageName: '@storybook/addon-interactions',
          packageVersion: '6.5.16',
        },
      ],
    });
  });
});
