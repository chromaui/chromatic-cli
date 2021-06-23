import path from 'path';

import { getDependentStoryFiles } from './getDependentStoryFiles';
import { getWorkingDir } from '../git/git';

jest.mock('../git/git');

const CSF_GLOB = './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$';

const ctx = {
  log: { warn: jest.fn() },
};

describe('getDependentStoryFiles', () => {
  it('detects direct changes to CSF files', async () => {
    const changedFiles = ['./src/foo.stories.js'];
    const modules = [
      {
        id: 1,
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 999,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const res = await getDependentStoryFiles(ctx, { modules }, changedFiles);
    expect(res).toEqual({
      1: './src/foo.stories.js',
    });
  });

  it('detects indirect changes to CSF files', async () => {
    const changedFiles = ['./src/foo.js'];
    const modules = [
      {
        id: 1,
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: 2,
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 999,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const res = await getDependentStoryFiles(ctx, { modules }, changedFiles);
    expect(res).toEqual({
      2: './src/foo.stories.js',
    });
  });

  it('supports webpack root in git subdirectory', async () => {
    getWorkingDir.mockResolvedValueOnce('frontend');
    const changedFiles = ['./frontend/src/foo.js'];
    const modules = [
      {
        id: 1,
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: 2,
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 999,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const res = await getDependentStoryFiles(ctx, { modules }, changedFiles);
    expect(res).toEqual({
      2: './src/foo.stories.js',
    });
  });
});
