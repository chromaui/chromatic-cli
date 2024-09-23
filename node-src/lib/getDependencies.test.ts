import path from 'path';
import { describe, expect, it } from 'vitest';

import packageJson from '../__mocks__/dependencyChanges/plain-package.json';
import { checkoutFile } from '../git/git';
import { getDependencies } from './getDependencies';
import TestLogger from './testLogger';

const ctx = { log: new TestLogger() } as any;

describe('getDependencies', () => {
  it('should return a set of dependencies', async () => {
    const dependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../__mocks__/dependencyChanges'),
      manifestPath: 'plain-package.json',
      lockfilePath: 'plain-yarn.lock',
    });

    const [dep] = dependencies;
    expect(dep).toMatch(/^[\w/@-]+@@[\d.]+$/);

    const dependencyNames = [...dependencies].map((dependency) => dependency.split('@@')[0]);
    expect(dependencyNames).toEqual(
      expect.arrayContaining([
        ...Object.keys(packageJson.dependencies),
        ...Object.keys(packageJson.devDependencies),
      ])
    );
  });

  it.skip('should handle checked out manifest and lock files', async () => {
    const dependencies = await getDependencies(ctx, {
      rootPath: '/',
      manifestPath: await checkoutFile(ctx, 'HEAD', 'package.json'),
      lockfilePath: await checkoutFile(ctx, 'HEAD', 'yarn.lock'),
    });

    const dependencyNames = [...dependencies].map((dependency) => dependency.split('@@')[0]);
    expect(dependencyNames).toEqual(
      expect.arrayContaining([
        ...Object.keys(packageJson.dependencies),
        ...Object.keys(packageJson.devDependencies),
      ])
    );
  });

  it('should handle historic files', async () => {
    // chromatic@6.12.0
    const commit = 'e61c2688597a6fda61a7057c866ebfabde955784';

    const dependencies = await getDependencies(ctx, {
      rootPath: '/',
      manifestPath: await checkoutFile(ctx, commit, 'package.json'),
      lockfilePath: await checkoutFile(ctx, commit, 'yarn.lock'),
    });

    const dependencyNames = [...dependencies].map((dependency) => dependency.split('@@')[0]);
    expect(dependencyNames).toEqual(
      expect.arrayContaining([
        // @see https://github.com/chromaui/chromatic-cli/blob/e61c2688597a6fda61a7057c866ebfabde955784/package.json#L75-L170
        '@discoveryjs/json-ext',
        '@types/webpack-env',
        '@actions/core',
        '@actions/github',
        '@babel/cli',
        '@babel/core',
        '@babel/node',
        '@babel/plugin-transform-runtime',
        '@babel/preset-env',
        '@babel/preset-typescript',
        '@babel/runtime',
        '@chromaui/localtunnel',
        '@storybook/addon-essentials',
        '@storybook/builder-webpack5',
        '@storybook/eslint-config-storybook',
        '@storybook/linter-config',
        '@storybook/manager-webpack5',
        '@storybook/react',
        '@types/archiver',
        '@types/async-retry',
        '@types/cross-spawn',
        '@types/fs-extra',
        '@types/jest',
        '@types/jsonfile',
        '@types/listr',
        '@types/node',
        '@types/picomatch',
        '@types/progress-stream',
        '@types/semver',
        '@typescript-eslint/eslint-plugin',
        '@typescript-eslint/parser',
        'ansi-html',
        'any-observable',
        'archiver',
        // ...
      ])
    );
  });
});
