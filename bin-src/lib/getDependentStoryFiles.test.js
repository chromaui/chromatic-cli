import { getDependentStoryFiles } from './getDependentStoryFiles';
import { getRepositoryRoot } from '../git/git';
import { getWorkingDir } from './utils';

jest.mock('../git/git');
jest.mock('./utils');

const CSF_GLOB = './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$';

const ctx = {
  log: { warn: jest.fn(), debug: jest.fn() },
};

getRepositoryRoot.mockResolvedValue('/path/to/project');
getWorkingDir.mockReturnValue('');

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
    getWorkingDir.mockReturnValueOnce('services/webapp');
    const changedFiles = ['./services/webapp/src/foo.js'];
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

  it('supports absolute module paths', async () => {
    getRepositoryRoot.mockResolvedValueOnce('/path/to/project');
    const absoluteCsfGlob = `/path/to/project/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['./src/foo.js'];
    const modules = [
      {
        id: 1,
        name: '/path/to/project/src/foo.js',
        reasons: [{ moduleName: '/path/to/project/src/foo.stories.js' }],
      },
      {
        id: 2,
        name: '/path/to/project/src/foo.stories.js',
        reasons: [{ moduleName: absoluteCsfGlob }],
      },
      {
        id: 999,
        name: absoluteCsfGlob,
        // path to generated-stories-entry.js is always relative
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const res = await getDependentStoryFiles(ctx, { modules }, changedFiles);
    expect(res).toEqual({
      2: './src/foo.stories.js',
    });
  });

  it('supports absolute module paths with deviating working dir', async () => {
    getRepositoryRoot.mockResolvedValueOnce('/path/to/project');
    getWorkingDir.mockReturnValueOnce('services/webapp');
    const absoluteCsfGlob = `/path/to/project/services/webapp/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['./services/webapp/src/foo.js'];
    const modules = [
      {
        id: 1,
        name: '/path/to/project/services/webapp/src/foo.js',
        reasons: [{ moduleName: '/path/to/project/services/webapp/src/foo.stories.js' }],
      },
      {
        id: 2,
        name: '/path/to/project/services/webapp/src/foo.stories.js',
        reasons: [{ moduleName: absoluteCsfGlob }],
      },
      {
        id: 999,
        name: absoluteCsfGlob,
        // path to generated-stories-entry.js is always relative
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const res = await getDependentStoryFiles(ctx, { modules }, changedFiles);
    expect(res).toEqual({
      2: './src/foo.stories.js',
    });
  });
});
