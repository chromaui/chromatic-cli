import { describe, expect, it } from 'vitest';

import { getStorybookMetadataFromProjectJson } from './getPrebuiltStorybookMetadata';

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
    });
  });
});
