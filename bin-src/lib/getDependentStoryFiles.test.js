import { getDependentStoryFiles, normalizePath } from './getDependentStoryFiles';
import { getRepositoryRoot } from '../git/git';
import { getWorkingDir } from './utils';

jest.mock('../git/git');
jest.mock('./utils');

const CSF_GLOB = './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$';

const ctx = {
  log: { warn: jest.fn(), debug: jest.fn() },
};

beforeEach(() => {
  ctx.log.warn.mockReset();
  ctx.log.debug.mockReset();
});

getRepositoryRoot.mockResolvedValue('/path/to/project');
getWorkingDir.mockReturnValue('');

describe('getDependentStoryFiles', () => {
  it('detects direct changes to CSF files', async () => {
    const changedFiles = ['src/foo.stories.js'];
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
      1: 'src/foo.stories.js',
    });
  });

  it('detects indirect changes to CSF files', async () => {
    const changedFiles = ['src/foo.js'];
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
      2: 'src/foo.stories.js',
    });
  });

  it('supports webpack projectRoot in git subdirectory', async () => {
    getWorkingDir.mockReturnValueOnce('services/webapp');
    const changedFiles = ['services/webapp/src/foo.js'];
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
      2: 'services/webapp/src/foo.stories.js',
    });
  });

  it('supports absolute module paths', async () => {
    getRepositoryRoot.mockResolvedValueOnce('/path/to/project');
    const absoluteCsfGlob = `/path/to/project/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['src/foo.js'];
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
      2: 'src/foo.stories.js',
    });
  });

  it('supports absolute module paths with deviating working dir', async () => {
    getRepositoryRoot.mockResolvedValueOnce('/path/to/project');
    getWorkingDir.mockReturnValueOnce('packages/storybook'); // note this is a different workspace

    const absoluteCsfGlob = `/path/to/project/packages/webapp/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['packages/webapp/src/foo.js'];
    const modules = [
      {
        id: 1,
        name: '/path/to/project/packages/webapp/src/foo.js',
        reasons: [{ moduleName: '/path/to/project/packages/webapp/src/foo.stories.js' }],
      },
      {
        id: 2,
        name: '/path/to/project/packages/webapp/src/foo.stories.js',
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
      2: 'packages/webapp/src/foo.stories.js',
    });
  });

  it('bails on changed global file', async () => {
    const changedFiles = ['src/foo.stories.js', 'src/package.json'];
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
    expect(res).toEqual(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Found a change in src/package.json')
    );
  });

  it('bails on changed config file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/storybook-config/file.js'];
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
    const res = await getDependentStoryFiles(
      { ...ctx, storybook: { configDir: 'path/to/storybook-config' } },
      { modules },
      changedFiles
    );
    expect(res).toEqual(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Found a change in path/to/storybook-config/file.js')
    );
  });

  it('bails on changed static file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/statics/image.png'];
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
    const res = await getDependentStoryFiles(
      { ...ctx, storybook: { staticDir: ['path/to/statics'] } },
      { modules },
      changedFiles
    );
    expect(res).toEqual(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Found a change in path/to/statics/image.png')
    );
  });
});

describe('normalizePath', () => {
  it('converts absolute paths to relative paths', () => {
    const projectRoot = '/path/to/project';
    const normalized = normalizePath(`${projectRoot}/src/webapp/file.js`, projectRoot);
    expect(normalized).toBe('src/webapp/file.js');
  });

  it('returns already relative paths as-is', () => {
    const projectRoot = '/path/to/project';
    const normalized = normalizePath(`src/webapp/file.js`, projectRoot);
    expect(normalized).toBe('src/webapp/file.js');
  });

  it('handles complex relative paths', () => {
    const projectRoot = '/path/to/project';
    const normalized = normalizePath(`../webapp/file.js`, projectRoot);
    expect(normalized).toBe('../webapp/file.js');
  });

  describe('with workingDir', () => {
    it('makes relative paths relative to the project root', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(`folder/file.js`, projectRoot, 'packages/webapp');
      expect(normalized).toBe('packages/webapp/folder/file.js');
    });

    it('handles complex relative paths', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `../../packages/webapp/folder/file.js`,
        projectRoot,
        'packages/tools'
      );
      expect(normalized).toBe('packages/webapp/folder/file.js');
    });

    it('converts absolute paths to relative paths as normal', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `${projectRoot}/packages/webapp/file.js`,
        projectRoot,
        'packages/webapp'
      );
      expect(normalized).toBe('packages/webapp/file.js');
    });

    it('does not affect paths outside of working dir', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `${projectRoot}/packages/webapp/file.js`,
        projectRoot,
        'packages/tools'
      );
      expect(normalized).toBe('packages/webapp/file.js');
    });
  });
});
