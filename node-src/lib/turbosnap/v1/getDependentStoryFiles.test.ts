/* eslint-disable max-lines, max-statements */
import chalk from 'chalk';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { Context, Module } from '../../../types';
import TestLogger from '../../testLogger';
import { getDependentStoryFiles } from './getDependentStoryFiles';
import { normalizePath } from './statsPaths';

const CSF_GLOB = String.raw`./src sync ^\.\/(?:(?!\.)(?=.)[^/]*?\.stories\.js)$`;
const statsPath = 'preview-stats.json';
// Builds a module fixture whose id and name are equal.
const buildModule = (id: string, ...reasons: string[]) => ({
  id,
  name: id,
  reasons: reasons.map((moduleName) => ({ moduleName })),
});

// The changed dependencies, with every copy of them changed unless `isUnchangedCopy` says otherwise.
const changedDeps = (...names: string[]) => ({ names, isUnchangedCopy: () => false });

// Runs a grouping case with its two colliding modules in both possible orders.
const bothOrders = <T>(first: T, second: T, rest: T[]) => [
  [[first, second, ...rest]],
  [[second, first, ...rest]],
];

const log = new TestLogger();
const getContext: any = (
  {
    configDir,
    staticDirs,
    ...options
  }: { configDir?: string; staticDirs?: string[] } & Context['options'] = {} as any
) => {
  const rootPath = '/path/to/project';
  const projectRoot = path.resolve(rootPath, options.storybookBaseDir ?? '');
  return {
    log,
    options,
    turboSnap: {},
    storybook: {
      projectRoot,
      ...(configDir && { configDir: path.resolve(projectRoot, configDir) }),
      ...(staticDirs && {
        staticDirs: staticDirs.map((directory) => path.resolve(projectRoot, directory)),
      }),
    },
    git: { rootPath },
  };
};

afterEach(() => {
  log.info.mockReset();
  log.warn.mockReset();
  log.error.mockReset();
  log.debug.mockReset();
});

describe('getDependentStoryFiles', () => {
  it('detects direct changes to CSF files', async () => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('detects direct changes to CSF files, 6.4 v6 store', async () => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('detects direct changes to CSF files, 6.4 v6 store in subdirectory', async () => {
    const changedFiles = ['path/to/project/src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ storybookBaseDir: 'path/to/project' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['path/to/project/src/foo.stories.js'],
      },
    });
  });

  it('detects direct changes to CSF files, 6.5 v6 store', async () => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './generated-stories-entry.cjs' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('detects direct changes to CSF files, 6.4 v7 store', async () => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it.each([
    '/virtual:/@storybook/builder-vite/storybook-stories.js',
    'virtual:@storybook/builder-vite/storybook-stories.js',
  ])('detects direct changes to CSF files, vite', async (viteEntry) => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: viteEntry }],
      },
      {
        id: viteEntry,
        name: viteEntry,
        reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it.each([
    [`./node_modules/.cache/storybook/default/dev-server/storybook-stories.js`],
    ['./node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js'],
    [`./node_modules/.cache/storybook/storybook-rsbuild-builder/storybook-config-entry.js`],
    [`./node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js`],
    [`./storybook-config-entry.js`],
  ])('detects direct changes to CSF files, rspack (%s)', async (resolvedModule) => {
    const changedFiles = ['src/foo.stories.js'];
    const modules = [
      {
        name: './src/foo.stories.js',
        id: './src/foo.stories.js',
        reasons: [
          {
            moduleName: String.raw`/path/to/project|/^\.\/.*$/|include: /(?!.*node_modules)(?:\/\.\.\/(?!\.)(?=.)[^/]*?\.stories\.js)$/|chunkName: [request]|groupOptions: {}|namespace object`,
          },
        ],
      },
      {
        name: String.raw`/path/to/project|/^\.\/.*$/|include: /(?!.*node_modules)(?:\/\.\.\/(?!\.)(?=.)[^/]*?\.stories\.js)$/|chunkName: [request]|groupOptions: {}|namespace object`,
        id: String.raw`./src lazy recursive ^\.\/.*$`,
        reasons: [
          {
            moduleName: `${resolvedModule} + 2 modules`,
          },
        ],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('detects indirect changes to CSF files', async () => {
    const changedFiles = ['src/foo.js'];
    const modules = [
      {
        id: './src/foo.js',
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('detects indirect changes to CSF files, angular css resource', async () => {
    const changedFiles = ['src/foo.css'];
    const modules = [
      {
        id: null,
        name: './src/foo.css?ngResource ',
        reasons: [{ moduleName: './src/foo.component.ts' }],
      },
      {
        id: './src/foo.component.ts',
        name: './src/foo.component.ts + 1 modules',
        modules: [{ name: './src/foo.component.ts' }, { name: './src/foo.css?ngResource' }],
        reasons: [{ moduleName: './src/foo.stories.ts' }],
      },
      {
        id: './src/foo.stories.ts',
        name: './src/foo.stories.ts',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.ts': ['src/foo.stories.ts'],
      },
    });
  });

  it('detects indirect changes to CSF files in a single module chunk', async () => {
    const changedFiles = ['src/foo.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js + 1 modules',
        modules: [{ name: './src/foo.stories.js' }, { name: './src/foo.js' }],
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js', 'src/foo.js'],
      },
    });
  });

  it('detects changes in module dependencies', async () => {
    const changedFiles = [];
    const changedDependencies = changedDeps('react');
    const modules = [
      {
        id: './node_modules/react/index.js',
        name: './node_modules/react/index.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(
      ctx,
      { modules },
      statsPath,
      changedFiles,
      changedDependencies
    );
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  describe('with two copies of a changed dependency', () => {
    // Preview loads the hoisted is-number@7, a story loads is-odd's nested is-number@6, which
    // belongs to the is-odd copy.
    const modules = [
      buildModule('./node_modules/is-number/index.js', './.storybook/preview.js'),
      buildModule('./.storybook/preview.js', './.storybook/generated-stories-entry.js'),
      buildModule(
        './node_modules/is-odd/node_modules/is-number/index.js',
        './node_modules/is-odd/index.js'
      ),
      buildModule('./node_modules/is-odd/index.js', './src/foo.stories.js'),
      buildModule('./src/foo.stories.js', CSF_GLOB),
      buildModule(CSF_GLOB, './.storybook/generated-stories-entry.js'),
    ];
    const trace = (isUnchangedCopy?: (directory: string, name: string) => boolean) =>
      getDependentStoryFiles(getContext(), { modules }, statsPath, [], {
        names: ['is-number', 'is-odd'],
        isUnchangedCopy: isUnchangedCopy ?? (() => false),
      });

    it('only traces the copies that changed', async () => {
      const result = await trace(
        (directory, name) => name === 'is-number' && directory === 'node_modules/is-number'
      );
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/foo.stories.js': ['src/foo.stories.js'] },
      });
    });

    it('traces every copy when it cannot tell which changed', async () => {
      const result = await trace();
      expect(result.status).toBe('bailed');
      expect(result.turboSnap.bailReason).toEqual({
        changedStorybookFiles: ['.storybook/preview.js'],
      });
    });
  });

  it('supports webpack projectRoot in git subdirectory', async () => {
    const changedFiles = ['services/webapp/src/foo.js'];
    const modules = [
      {
        id: './src/foo.js',
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ storybookBaseDir: 'services/webapp' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['services/webapp/src/foo.stories.js'],
      },
    });
  });

  it('supports absolute module paths', async () => {
    const absoluteCsfGlob = `/path/to/project/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['src/foo.js'];
    const modules = [
      {
        id: '/path/to/project/src/foo.js',
        name: '/path/to/project/src/foo.js',
        reasons: [{ moduleName: '/path/to/project/src/foo.stories.js' }],
      },
      {
        id: '/path/to/project/src/foo.stories.js',
        name: '/path/to/project/src/foo.stories.js',
        reasons: [{ moduleName: absoluteCsfGlob }],
      },
      {
        id: absoluteCsfGlob,
        name: absoluteCsfGlob,
        // path to generated-stories-entry.js is always relative
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        '/path/to/project/src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('supports absolute module paths with deviating working dir', async () => {
    const absoluteCsfGlob = `/path/to/project/packages/webapp/${CSF_GLOB.slice(2)}`;
    const changedFiles = ['packages/webapp/src/foo.js'];
    const modules = [
      {
        id: '/path/to/project/packages/webapp/src/foo.js',
        name: '/path/to/project/packages/webapp/src/foo.js',
        reasons: [{ moduleName: '/path/to/project/packages/webapp/src/foo.stories.js' }],
      },
      {
        id: '/path/to/project/packages/webapp/src/foo.stories.js',
        name: '/path/to/project/packages/webapp/src/foo.stories.js',
        reasons: [{ moduleName: absoluteCsfGlob }],
      },
      {
        id: absoluteCsfGlob,
        name: absoluteCsfGlob,
        // path to generated-stories-entry.js is always relative
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ storybookBaseDir: 'packages/storybook' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        '/path/to/project/packages/webapp/src/foo.stories.js': [
          'packages/webapp/src/foo.stories.js',
        ],
      },
    });
  });

  it('throws on missing CSF glob', async () => {
    const changedFiles = ['src/styles.js'];
    const modules = [
      {
        id: './src/styles.js',
        name: './src/styles.js',
        reasons: [{ moduleName: './path/to/storybook-config/file.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    let err;
    try {
      await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.message).toContain('Did not find any CSF globs in preview-stats.json');
  });

  it('does not bail on changed global file', async () => {
    const changedFiles = [
      'src/foo.stories.js',
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
    ];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
    expect(result.turboSnap.bailReason).toBeUndefined();
  });

  it('only runs tests for stories affected by dependency changes', async () => {
    const changedFiles = [];
    const changedDependencies = {
      names: ['@adobe/css-tools'] as string[],
      isUnchangedCopy: () => false,
    };
    const modules = [
      {
        id: './node_modules/@adobe/css-tools/dist/index.js',
        name: './node_modules/@adobe/css-tools/dist/index.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(
      ctx,
      { modules },
      statsPath,
      changedFiles,
      changedDependencies
    );
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('does not bail on dependency changes to package manifest file when untraced', async () => {
    const changedFiles = ['src/foo.stories.js', 'src/package.json', 'src/package-lock.json'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const rawContext = getContext({
      untraced: ['**/(package.json|package-lock.json|yarn.lock|pnpm-lock.yaml)'],
    });
    const ctx = {
      ...rawContext,
      // signifying the package.json file had dependency changes
      git: { ...rawContext.git, changedPackageManifests: ['src/package.json'] },
    };
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('bails on changed Storybook config file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/storybook-config/file.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/file.js'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`Found a Storybook config change in {bold path/to/storybook-config/file.js}`
      )
    );
  });

  it.each([
    'path/to/storybook-config/README.md',
    'path/to/storybook-config/docs/guidelines.md',
    'path/to/storybook-config/notes.txt',
  ])(
    'does not bail on changed documentation file %s in the Storybook config dir',
    async (documentationFile) => {
      const changedFiles = ['src/foo.stories.js', documentationFile];
      const modules = [
        {
          id: './src/foo.stories.js',
          name: './src/foo.stories.js',
          reasons: [{ moduleName: CSF_GLOB }],
        },
        {
          id: CSF_GLOB,
          name: CSF_GLOB,
          reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
        },
      ];
      const ctx = getContext({ configDir: 'path/to/storybook-config' });
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
      expect(result.turboSnap.bailReason).toBeUndefined();
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: {
          './src/foo.stories.js': ['src/foo.stories.js'],
        },
      });
    }
  );

  it('still bails on a real config change when a documentation file changed alongside it', async () => {
    const changedFiles = [
      'path/to/storybook-config/README.md',
      'path/to/storybook-config/preview.js',
    ];
    const modules = [
      {
        id: './path/to/storybook-config/preview.js',
        name: './path/to/storybook-config/preview.js',
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/preview.js'],
    });
  });

  it('bails using the resolved config dir, not the cwd-relative option', async () => {
    const changedFiles = ['packages/ui/.storybook-ci/file.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook-ci/generated-stories-entry.js' }],
      },
    ];
    // The user runs the CLI at the repo root, so the option they typed and the directory the
    // builder's paths are relative to are written differently.
    const ctx = getContext({
      configDir: '.storybook-ci',
      storybookBaseDir: 'packages/ui',
      storybookConfigDir: 'packages/ui/.storybook-ci',
    });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['packages/ui/.storybook-ci/file.js'],
    });
  });

  it('does not bail on changed external Storybook config file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/other-storybook/.storybook/file.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('bails on changed preview.js file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/storybook-config/preview.js'];
    const modules = [
      {
        id: './path/to/storybook-config/preview.js',
        name: './path/to/storybook-config/preview.js',
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/preview.js'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`Found a Storybook config change in {bold path/to/storybook-config/preview.js}`
      )
    );
  });

  it('bails on changed dependency of config file', async () => {
    const changedFiles = ['src/styles.js'];
    const modules = [
      {
        id: './src/styles.js',
        name: './src/styles.js',
        reasons: [{ moduleName: './path/to/storybook-config/file.js' }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/file.js'],
    });
    expect(result.turboSnap.bailPath).toEqual([
      'src/styles.js',
      'path/to/storybook-config/file.js',
    ]);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`Found a Storybook config change in {bold path/to/storybook-config/file.js}`
      )
    );
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`This was triggered by a change to {bold src/styles.js}, which is imported by {bold path/to/storybook-config/file.js}`
      )
    );
  });

  it('traces the full import chain when a deeply nested dependency of a config file changes', async () => {
    const changedFiles = ['src/theme.js'];
    const modules = [
      {
        id: './src/theme.js',
        name: './src/theme.js',
        reasons: [{ moduleName: './src/tokens.js' }],
      },
      {
        id: './src/tokens.js',
        name: './src/tokens.js',
        reasons: [{ moduleName: './path/to/storybook-config/preview.js' }],
      },
      {
        id: './path/to/storybook-config/preview.js',
        name: './path/to/storybook-config/preview.js',
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/preview.js'],
    });
    expect(result.turboSnap.bailPath).toEqual([
      'src/theme.js',
      'src/tokens.js',
      'path/to/storybook-config/preview.js',
    ]);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`This was triggered by a change to {bold src/theme.js}, which is imported by {bold path/to/storybook-config/preview.js}`
      )
    );
    // The full import chain is rendered, including the intermediate file (src/tokens.js).
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`{dim →} {bold src/theme.js}\n{dim →} {bold src/tokens.js}\n{dim →} {bold path/to/storybook-config/preview.js}`
      )
    );
  });

  it('bails on changed dependency of config file if it is in a single module chunk', async () => {
    const changedFiles = ['src/styles.js'];
    const modules = [
      {
        id: './path/to/storybook-config/file.js',
        name: './path/to/storybook-config/file.js + 1 modules',
        modules: [{ name: './path/to/storybook-config/file.js' }, { name: './src/styles.js' }],
        reasons: [],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ configDir: 'path/to/storybook-config' });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['path/to/storybook-config/file.js', 'src/styles.js'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`Found a Storybook config change in {bold path/to/storybook-config/file.js}`
      )
    );
  });

  it('bails on changed static file', async () => {
    const changedFiles = ['src/foo.stories.js', 'path/to/statics/image.png'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ staticDirs: ['path/to/statics'] });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStaticFiles: ['path/to/statics/image.png'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(chalk`Found a static file change in {bold path/to/statics/image.png}`)
    );
  });

  // A static asset nested under the Storybook config dir (e.g. an MSW
  // auto-generated `mockServiceWorker.js`) must be categorized by its
  // staticDir membership, not by its `.storybook/` prefix.
  it('bails on changed static file nested inside Storybook config dir', async () => {
    const changedFiles = ['src/foo.stories.js', '.storybook/static/foo.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({ staticDirs: ['.storybook/static'] });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStaticFiles: ['.storybook/static/foo.js'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(chalk`Found a static file change in {bold .storybook/static/foo.js}`)
    );
  });

  it('falls back to Storybook config bail for files inside .storybook when no staticDirs configured', async () => {
    const changedFiles = ['src/foo.stories.js', '.storybook/static/foo.js'];
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedStorybookFiles: ['.storybook/static/foo.js'],
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        chalk`Found a Storybook config change in {bold .storybook/static/foo.js}`
      )
    );
  });

  it('ignores untraced files and dependencies with a glob pattern match', async () => {
    const changedFiles = ['src/stories/Button.jsx', 'src/stories/Page.jsx'];
    const modules = [
      {
        id: './src/stories/Button.jsx', // changed
        name: './src/stories/Button.jsx + 1 modules',
        reasons: [
          { moduleName: './src/stories/Button.stories.jsx' },
          { moduleName: './src/stories/Header.jsx + 1 modules' },
        ],
      },
      {
        id: './src/stories/Header.jsx',
        name: './src/stories/Header.jsx + 1 modules',
        reasons: [
          { moduleName: './src/stories/Header.stories.jsx' },
          { moduleName: './src/stories/Page.stories.jsx + 2 modules' },
          { moduleName: './src/stories/Page.jsx' },
        ],
      },
      {
        id: null,
        name: './src/stories/Page.jsx', // changed
        reasons: [{ moduleName: './src/stories/Page.stories.jsx' }],
      },
      {
        id: null,
        name: './src/stories/button.css',
        reasons: [{ moduleName: './src/stories/Button.jsx' }],
      },
      {
        id: null,
        name: './src/stories/header.css',
        reasons: [{ moduleName: './src/stories/Header.jsx' }],
      },
      {
        id: null,
        name: './src/stories/page.css',
        reasons: [{ moduleName: './src/stories/Page.jsx' }],
      },
      {
        id: './src/stories/Button.stories.jsx',
        name: './src/stories/Button.stories.jsx',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './src/stories/Header.stories.jsx',
        name: './src/stories/Header.stories.jsx',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './src/stories/Page.stories.jsx',
        name: './src/stories/Page.stories.jsx + 2 modules',
        modules: [
          { name: './src/stories/Page.stories.jsx' },
          { name: './src/stories/Page.jsx' },
          { name: './src/stories/page.css' },
        ],
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 999,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({
      staticDirs: ['public'],
      untraced: ['**/stories/**'],
    });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {},
      untracedFiles: [
        { filepath: 'src/stories/Button.jsx', glob: '**/stories/**' },
        { filepath: 'src/stories/Page.jsx', glob: '**/stories/**' },
      ],
    });
  });

  it.each(['./src/foo.js', './src/foo.js + 1 module', './src/foo.js + 2 modules'])(
    `ignores untraced files for module name %s`,
    async (moduleName) => {
      const changedFiles = ['src/utils.js'];
      const modules = [
        {
          id: 1,
          name: './src/utils.js', // changed
          reasons: [{ moduleName: moduleName }],
        },
        {
          id: 2,
          name: moduleName, // untraced
          reasons: [{ moduleName: './src/foo.stories.js' }],
        },
        {
          id: 3,
          name: './src/foo.stories.js',
          reasons: [{ moduleName: CSF_GLOB }],
        },
        {
          id: 999,
          name: CSF_GLOB,
          reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
        },
      ];
      const ctx = getContext({
        staticDirs: ['path/to/statics'],
        untraced: ['**/foo.js'],
      });
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: {},
      });
      expect(result.turboSnap.bailReason).toBeUndefined();
    }
  );

  it('does not bail on untraced global files', async () => {
    const changedFiles = [
      'src/utils.js',
      'src/package.json',
      'src/package-lock.json',
      'src/yarn.lock',
      'src/pnpm-lock.yaml',
    ];
    const modules = [
      {
        id: './src/utils.js',
        name: './src/utils.js', // changed
        reasons: [{ moduleName: './src/foo.js' }],
      },
      {
        id: './src/foo.js',
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 997,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({
      untraced: ['**/(package**.json|yarn.lock|pnpm-lock.yaml)'],
    });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('does not bail on untraced Storybook config files that change due to a module sibling', async () => {
    const changedFiles = ['src/utils.js', 'src/packages/design-system/components/button.jsx'];
    const modules = [
      {
        id: './src/utils.js',
        name: './src/utils.js', // changed
        reasons: [{ moduleName: './src/foo.js' }],
      },
      {
        id: './src/foo.js',
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './src/packages/design-system/components/button.jsx',
        name: './src/packages/design-system/components/button.jsx', // changed
        reasons: [{ moduleName: './src/decorator.jsx' }],
      },
      {
        id: './src/packages/design-system/components/button.stories.js',
        name: './src/packages/design-system/components/button.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './storybook/decorator.jsx',
        name: './storybook/decorator.jsx', // untraced
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: 997,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({
      untraced: ['**/decorator.jsx'],
    });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });
  it('does not bail on changed dependency in dynamic import of untraced config file', async () => {
    const changedFiles = ['src/utils.js', 'src/packages/design-system/components/button.jsx'];
    const modules = [
      {
        id: String.raw`./packages/website/containers/ weak ^\.\/.*\/index$`,
        name: String.raw`./packages/website/containers/ weak ^\.\/.*\/index$`,
        reasons: [{ moduleName: './src/packages/design-system/components/button.jsx' }],
      },
      {
        id: './src/packages/design-system/components/button.jsx',
        name: './src/packages/design-system/components/button.jsx + 1 modules', // changed
        reasons: [
          { moduleName: './src/decorator.jsx' },
          { moduleName: './src/packages/design-system/components/button.stories.js' },
        ],
      },
      {
        id: './src/packages/design-system/components/button.stories.js',
        name: './src/packages/design-system/components/button.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './storybook/decorator.jsx',
        name: './storybook/decorator.jsx', // untraced
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: './src/utils.js',
        name: './src/utils.js', // changed
        reasons: [{ moduleName: './src/foo.js' }],
      },
      {
        id: './src/foo.js',
        name: './src/foo.js',
        reasons: [{ moduleName: './src/foo.stories.js' }],
      },
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './path/to/storybook-config/generated-stories-entry.js' }],
      },
    ];
    const ctx = getContext({
      configDir: 'path/to/storybook-config',
      untraced: ['**/decorator.jsx'],
    });
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, changedFiles);
    expect(result.turboSnap.bailReason).toBeUndefined();
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: {
        './src/foo.stories.js': ['src/foo.stories.js'],
      },
    });
  });

  it('bails with bailSubreason "nodeModulesMissingInStats" when the stats file has no node_modules entries', async () => {
    const changedFiles = ['package.json'];
    const changedDependencies = changedDeps('some-pkg');
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const rawContext = getContext();
    const ctx = {
      ...rawContext,
      git: { ...rawContext.git, changedFiles: ['package.json'] },
    };
    const result = await getDependentStoryFiles(
      ctx,
      { modules },
      statsPath,
      changedFiles,
      changedDependencies
    );
    expect(result.status).toBe('bailed');
    expect(result.turboSnap.bailReason).toEqual({
      changedPackageFiles: ['package.json'],
      bailSubreason: 'nodeModulesMissingInStats',
    });
  });

  it('does not set bailSubreason when there are no changed dependencies', async () => {
    const changedFiles = ['package.json'];
    const changedDependencies = changedDeps();
    const modules = [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: CSF_GLOB }],
      },
      {
        id: CSF_GLOB,
        name: CSF_GLOB,
        reasons: [{ moduleName: './.storybook/generated-stories-entry.js' }],
      },
    ];
    const rawContext = getContext();
    const ctx = {
      ...rawContext,
      git: { ...rawContext.git, changedFiles: ['package.json'] },
    };
    const result = await getDependentStoryFiles(
      ctx,
      { modules },
      statsPath,
      changedFiles,
      changedDependencies
    );
    expect(result.turboSnap.bailReason).toBeUndefined();
  });

  // CAP-5106: distinct modules can normalize to one name (Vue/Svelte SFC sub-modules, CommonJS
  // proxies, rsbuild stubs). They must merge into one group instead of overwriting each other
  // (last write wins), which made the losers' importers unreachable and untraced globs miss
  // NUL-prefixed proxies.
  const csfGlobModule = buildModule(CSF_GLOB, './.storybook/generated-stories-entry.js');

  const vueStyleFacet = './src/Foo.vue?vue&type=style&index=0&scoped=abc123&lang.css';
  const vueSfc = buildModule('./src/Foo.vue', './src/Foo.stories.ts', vueStyleFacet);
  const vueStyleModule = buildModule(vueStyleFacet, './src/Foo.vue');
  const vueStory = buildModule('./src/Foo.stories.ts', CSF_GLOB);

  it.each(bothOrders(vueSfc, vueStyleModule, [vueStory, csfGlobModule]))(
    'merges a Vue SFC and its ?vue&type=style sub-module (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, ['src/Foo.vue']);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/Foo.stories.ts': ['src/Foo.stories.ts'] },
      });
    }
  );

  const svelteStyleFacet =
    './src/Foo.stories.svelte?svelte&type=style&index=0&scoped=abc123&lang.css';
  const svelteStory = buildModule('./src/Foo.stories.svelte', CSF_GLOB);
  const svelteStyleModule = buildModule(svelteStyleFacet, './src/Foo.stories.svelte');

  it.each(bothOrders(svelteStory, svelteStyleModule, [csfGlobModule]))(
    'merges a Svelte CSF story and its ?svelte&type=style sub-module, reporting the plain ./ id (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, [
        'src/Foo.stories.svelte',
      ]);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/Foo.stories.svelte': ['src/Foo.stories.svelte'] },
      });
    }
  );

  const proxyEsId = '\0./node_modules/react/index.js?commonjs-es-import';
  const proxyRequestId = '\0./node_modules/react/index.js?commonjs-proxy';
  const proxyEs = buildModule(proxyEsId, './src/foo.stories.js');
  const proxyRequest = buildModule(proxyRequestId);
  const reactStory = buildModule('./src/foo.stories.js', CSF_GLOB);

  it.each(bothOrders(proxyEs, proxyRequest, [reactStory, csfGlobModule]))(
    'merges two NUL proxies of one dependency with different queries (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(
        ctx,
        { modules },
        statsPath,
        [],
        changedDeps('react')
      );
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/foo.stories.js': ['src/foo.stories.js'] },
      });
    }
  );

  const hoistedProxyId = '\0./../node_modules/react/index.js?commonjs-es-import';
  const hoistedProxy = buildModule(hoistedProxyId, './src/foo.stories.js');
  const hoistedPlain = buildModule('./../node_modules/react/index.js');

  it.each(bothOrders(hoistedProxy, hoistedPlain, [reactStory, csfGlobModule]))(
    'merges a hoisted NUL proxy with the plain file it proxies, project root below git root (module order %#)',
    async (modules) => {
      const ctx = getContext({ storybookBaseDir: 'webapp' });
      const result = await getDependentStoryFiles(
        ctx,
        { modules },
        statsPath,
        [],
        changedDeps('react')
      );
      expect(result.turboSnap.tracedFiles).toEqual(['node_modules/react/index.js']);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/foo.stories.js': ['webapp/src/foo.stories.js'] },
      });
    }
  );

  // CAP-5336: only a NUL proxy for a relative path stands for a file. Stripping the NUL from an
  // opaque id turned it into a phantom project file that a real changed file could match.
  it.each([
    '\0commonjsHelpers.js',
    '\0vite/preload-helper.js',
    '\0plugin-vue:export-helper',
    '\0/@data-uri/data:text/javascript,export default 1',
  ])('does not trace a changed file through the opaque NUL module %j', async (helperId) => {
    const ctx = getContext({ storybookBaseDir: 'packages/ui' });
    // The name the id had when the NUL was stripped
    const phantomFile = normalizePath(
      helperId.slice(1),
      '/path/to/project',
      ctx.storybook.projectRoot
    );
    const modules = [
      buildModule(helperId, './src/foo.js'),
      buildModule('./src/foo.js', './src/foo.stories.js'),
      reactStory,
      csfGlobModule,
    ];
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, [phantomFile]);
    expect(result).toMatchObject({ status: 'traced', onlyStoryFiles: {} });
    expect(result.turboSnap.modules).not.toContain(phantomFile);
  });

  const rsbuildStory = buildModule('./src/Button.stories.tsx', CSF_GLOB);
  const rsbuildStoryStub = buildModule('src/Button.stories.tsx');

  it.each(bothOrders(rsbuildStory, rsbuildStoryStub, [csfGlobModule]))(
    'keeps the ./-prefixed id for an rsbuild story stub collision (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, [
        'src/Button.stories.tsx',
      ]);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/Button.stories.tsx': ['src/Button.stories.tsx'] },
      });
    }
  );

  // rsbuild (storybook-builder-rsbuild 3.x) emits a concatenated story next to a plain copy of
  // the story and a bare stub; the container's `+ N modules` id matches no story's filename.
  const rsbuildStoryContainer: Module = {
    id: './src/Button.stories.tsx + 1 modules',
    name: './src/Button.stories.tsx + 1 modules',
    modules: [{ name: './src/Button.stories.tsx' }, { name: './src/Button.tsx' }],
    reasons: [{ moduleName: CSF_GLOB }],
  };

  it.each(bothOrders(rsbuildStoryContainer, rsbuildStory, [rsbuildStoryStub, csfGlobModule]))(
    'reports the plain ./ id when an rsbuild concatenated story contains a plain story (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, [
        'src/Button.stories.tsx',
      ]);
      if (result.status !== 'traced') throw new Error('expected traced');
      expect(result.onlyStoryFiles).toEqual({
        './src/Button.stories.tsx': ['src/Button.stories.tsx'],
      });
    }
  );

  const rsbuildCss = buildModule(
    './src/styles.module.css',
    './src/PathDerived.stories.tsx',
    './src/PathDerivedShared.stories.tsx'
  );
  const rsbuildCssStub = buildModule('src/styles.module.css');
  const pathDerivedStory = buildModule('./src/PathDerived.stories.tsx', CSF_GLOB);
  const pathDerivedSharedStory = buildModule('./src/PathDerivedShared.stories.tsx', CSF_GLOB);

  it.each(
    bothOrders(rsbuildCss, rsbuildCssStub, [
      pathDerivedStory,
      pathDerivedSharedStory,
      csfGlobModule,
    ])
  )(
    'reports both stories when an rsbuild bare stub collides with the CSS module (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, [
        'src/styles.module.css',
      ]);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: {
          './src/PathDerived.stories.tsx': ['src/PathDerived.stories.tsx'],
          './src/PathDerivedShared.stories.tsx': ['src/PathDerivedShared.stories.tsx'],
        },
      });
    }
  );

  const concatenatedA: Module = {
    id: 1,
    name: './src/foo.js + 1 modules',
    modules: [{ name: './src/foo.js' }, { name: './src/bar.js' }],
    reasons: [{ moduleName: './src/foo.stories.js' }],
  };
  const concatenatedB: Module = {
    id: 2,
    name: './src/foo.js + 1 modules',
    modules: [{ name: './src/foo.js' }, { name: './src/bar.js' }],
    reasons: [{ moduleName: './src/baz.stories.js' }],
  };

  it.each(
    bothOrders(concatenatedA, concatenatedB, [
      buildModule('./src/foo.stories.js', CSF_GLOB),
      buildModule('./src/baz.stories.js', CSF_GLOB),
      csfGlobModule,
    ])
  )(
    'merges reasons of concatenated modules sharing one name (module order %#)',
    async (modules) => {
      const ctx = getContext();
      const result = await getDependentStoryFiles(ctx, { modules }, statsPath, ['src/foo.js']);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: {
          './src/foo.stories.js': ['src/foo.stories.js'],
          './src/baz.stories.js': ['src/baz.stories.js'],
        },
      });
    }
  );

  it('keeps webpack lazy context names containing a question mark intact', async () => {
    const lazyContext = String.raw`./src lazy recursive ^\.\/.*\?raw$`;
    const modules = [
      buildModule(lazyContext, './.storybook/generated-stories-entry.js'),
      buildModule('./src/foo.js', './src/Foo.stories.js'),
      buildModule('./src/Foo.stories.js', lazyContext),
    ];
    const ctx = getContext();
    const result = await getDependentStoryFiles(ctx, { modules }, statsPath, ['src/foo.js']);
    expect(result).toMatchObject({
      status: 'traced',
      onlyStoryFiles: { './src/Foo.stories.js': ['src/Foo.stories.js'] },
    });
    expect(result.turboSnap.globs).toEqual([String.raw`src lazy recursive ^\.\/.*\?raw$`]);
  });

  it('untraces NUL proxy ids matching an untraced glob', async () => {
    const modules = [
      proxyEs,
      buildModule('./node_modules/react/index.js', './src/foo.stories.js'),
      reactStory,
      csfGlobModule,
    ];
    const ctx = getContext({ untraced: ['node_modules/**'] });
    const result = await getDependentStoryFiles(
      ctx,
      { modules },
      statsPath,
      [],
      changedDeps('react')
    );
    if (result.status !== 'traced') throw new Error('expected traced');
    expect(result.onlyStoryFiles).toEqual({});
    expect(result.untracedFiles).toEqual([
      { filepath: 'node_modules/react/index.js', glob: 'node_modules/**' },
    ]);
    expect(result.turboSnap.bailReason).toBeUndefined();
  });

  // CAP-5104: the Vite builder (storybookjs/storybook#36345) reports `project-annotations.js` as
  // the importer of every `previewAnnotations` entry and addon or framework `preview.js`. Those
  // apply to every story, so a change reaching them must bail, not report them as story files.
  describe.each([
    '/virtual:/@storybook/builder-vite/project-annotations.js',
    'virtual:@storybook/builder-vite/project-annotations.js',
  ])('with Vite project annotations (%s)', (projectAnnotations) => {
    const viteApp = '/virtual:/@storybook/builder-vite/vite-app.js';
    const storiesEntry = '/virtual:/@storybook/builder-vite/storybook-stories.js';
    const a11yPreview = './node_modules/@storybook/addon-a11y/dist/preview.js';
    const reactEntryPreview = './node_modules/@storybook/react/dist/entry-preview.js';
    const modules = [
      buildModule(viteApp),
      buildModule(storiesEntry, viteApp),
      buildModule(projectAnnotations, viteApp),
      buildModule('./.storybook/preview.tsx', projectAnnotations),
      buildModule('./src/stories/components/index.js', projectAnnotations),
      buildModule(a11yPreview, projectAnnotations),
      buildModule(reactEntryPreview, projectAnnotations),
      buildModule('./node_modules/axe-core/axe.js', a11yPreview),
      buildModule('./node_modules/react/index.js', reactEntryPreview, './src/Button.jsx'),
      buildModule('./src/Button.stories.jsx', storiesEntry),
      buildModule(
        './src/Button.jsx',
        './src/Button.stories.jsx',
        './src/stories/components/index.js'
      ),
      buildModule('./src/Header.jsx', './src/Header.stories.jsx'),
      buildModule('./src/Header.stories.jsx', storiesEntry),
    ];
    const trace = (changedFiles: string[], changedDependencies: string[] = []) =>
      getDependentStoryFiles(
        getContext(),
        { modules },
        statsPath,
        changedFiles,
        changedDeps(...changedDependencies)
      );

    it('bails on a changed preview annotation outside the config dir', async () => {
      const result = await trace(['src/stories/components/index.js']);
      expect(result.status).toBe('bailed');
      expect(result.turboSnap.bailReason).toEqual({
        changedStorybookFiles: ['src/stories/components/index.js'],
      });
      expect(result.turboSnap.bailPath).toEqual(['src/stories/components/index.js']);
      expect(result.turboSnap.globs).not.toContain(projectAnnotations);
    });

    it('bails on a changed file imported by a story and a preview annotation', async () => {
      const result = await trace(['src/Button.jsx']);
      expect(result.status).toBe('bailed');
      expect(result.turboSnap.bailPath).toEqual([
        'src/Button.jsx',
        'src/stories/components/index.js',
      ]);
    });

    it('bails on a dependency of an addon preview', async () => {
      const result = await trace([], ['axe-core']);
      expect(result.status).toBe('bailed');
      expect(result.turboSnap.bailReason).toEqual({
        changedStorybookFiles: ['node_modules/@storybook/addon-a11y/dist/preview.js'],
      });
      expect(result.turboSnap.bailPath).toEqual([
        'node_modules/axe-core/axe.js',
        'node_modules/@storybook/addon-a11y/dist/preview.js',
      ]);
    });

    it('bails on a dependency of the framework preview', async () => {
      const result = await trace([], ['react']);
      expect(result.status).toBe('bailed');
      expect(result.turboSnap.bailReason).toEqual({
        changedStorybookFiles: ['node_modules/@storybook/react/dist/entry-preview.js'],
      });
    });

    it('still bails on the config dir preview with its usual reason', async () => {
      const result = await trace(['.storybook/preview.tsx']);
      expect(result.turboSnap.bailReason).toEqual({
        changedStorybookFiles: ['.storybook/preview.tsx'],
      });
    });

    it('still traces a component only stories import', async () => {
      const result = await trace(['src/Header.jsx']);
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/Header.stories.jsx': ['src/Header.stories.jsx'] },
      });
    });

    it('does not bail on an untraced preview annotation', async () => {
      const result = await getDependentStoryFiles(
        getContext({ untraced: ['src/stories/components/**'] }),
        { modules },
        statsPath,
        ['src/Button.jsx']
      );
      expect(result).toMatchObject({
        status: 'traced',
        onlyStoryFiles: { './src/Button.stories.jsx': ['src/Button.stories.jsx'] },
      });
    });
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
      const normalized = normalizePath(
        `folder/file.js`,
        projectRoot,
        `${projectRoot}/packages/webapp`
      );
      expect(normalized).toBe('packages/webapp/folder/file.js');
    });

    it('handles complex relative paths', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `../../packages/webapp/folder/file.js`,
        projectRoot,
        `${projectRoot}/packages/tools`
      );
      expect(normalized).toBe('packages/webapp/folder/file.js');
    });

    it('converts absolute paths to relative paths as normal', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `${projectRoot}/packages/webapp/file.js`,
        projectRoot,
        `${projectRoot}/packages/webapp`
      );
      expect(normalized).toBe('packages/webapp/file.js');
    });

    it('does not affect paths outside of working dir', () => {
      const projectRoot = '/path/to/project';
      const normalized = normalizePath(
        `${projectRoot}/packages/webapp/file.js`,
        projectRoot,
        `${projectRoot}/packages/tools`
      );
      expect(normalized).toBe('packages/webapp/file.js');
    });
  });
});
