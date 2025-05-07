import fs, { statSync as unmockedStatSync } from 'fs';
import os from 'os';
import path from 'path';
import { inspect as unmockedInspect } from 'snyk-nodejs-plugin';
import { fileURLToPath } from 'url';
import { describe, expect, it, Mock, vi } from 'vitest';

import packageJson from '../../__mocks__/dependencyChanges/plain/package.json';
import { checkoutFile } from '../../git/git';
import TestLogger from '../testLogger';
import { SUPPORTED_LOCK_FILES } from './findChangedDependencies';
import { getDependencies, MAX_LOCK_FILE_SIZE } from './getDependencies';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ctx = { log: new TestLogger() } as any;
const statSync = unmockedStatSync as Mock;

vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>();
  return {
    ...actual,
    statSync: vi.fn().mockReturnValue({ size: 1 }),
  };
});

const inspect = unmockedInspect as Mock;

vi.mock('snyk-nodejs-plugin', async (original) => {
  const actual = await original<typeof import('snyk-nodejs-plugin')>();
  return {
    ...actual,
    inspect: vi
      .fn()
      .mockImplementation(async (rootPath: string, lockfilePath: string, options: any) => {
        return actual.inspect(rootPath, lockfilePath, options);
      }),
  };
});

describe('getDependencies', () => {
  it('should find top-level dependencies for each lock file type', async () => {
    for (const lockfile of SUPPORTED_LOCK_FILES) {
      const dependencies = await getDependencies(ctx, {
        rootPath: path.join(__dirname, '../../__mocks__/dependencyParsing'),
        manifestPath: 'package.json',
        lockfilePath: lockfile,
      });

      const dependencyNames = dependencies.getDepPkgs().map((pkg) => pkg.name);
      expect(dependencyNames).toEqual(
        expect.arrayContaining([
          ...Object.keys(packageJson.dependencies),
          ...Object.keys(packageJson.devDependencies),
        ])
      );
    }
  });

  it.skip('should handle checked out manifest and lock files', async () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));

    const dependencies = await getDependencies(ctx, {
      rootPath: tmpdir,
      manifestPath: await checkoutFile(ctx, 'HEAD', 'package.json', tmpdir),
      lockfilePath: await checkoutFile(ctx, 'HEAD', 'yarn.lock', tmpdir),
    });

    const dependencyNames = dependencies.getDepPkgs().map((pkg) => pkg.name);
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

    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic'));

    const dependencies = await getDependencies(ctx, {
      rootPath: tmpdir,
      manifestPath: await checkoutFile(ctx, commit, 'package.json', tmpdir),
      lockfilePath: await checkoutFile(ctx, commit, 'yarn.lock', tmpdir),
    });

    const dependencyNames = dependencies.getDepPkgs().map((pkg) => pkg.name);
    expect(dependencyNames).toEqual(
      expect.arrayContaining([
        // @see https://github.com/chromaui/chromatic-cli/blob/e61c2688597a6fda61a7057c866ebfabde955784/package.json#L75-L170
        '@discoveryjs/json-ext',
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

  it('should bail if the lock file is too large to parse', async () => {
    statSync.mockReturnValue({ size: MAX_LOCK_FILE_SIZE + 1000 });

    await expect(() =>
      getDependencies(ctx, {
        rootPath: path.join(__dirname, '../../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toThrowError();
  });

  it('should use MAX_LOCK_FILE_SIZE environment variable, if set', async () => {
    vi.stubEnv('MAX_LOCK_FILE_SIZE', (MAX_LOCK_FILE_SIZE + 2000).toString());
    statSync.mockReturnValue({ size: MAX_LOCK_FILE_SIZE + 1000 });

    const dependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    const dependencyNames = dependencies.getDepPkgs().map((pkg) => pkg.name);
    expect(dependencyNames).toEqual(
      expect.arrayContaining([
        ...Object.keys(packageJson.dependencies),
        ...Object.keys(packageJson.devDependencies),
      ])
    );
  });

  it('should error if a depTree is returned instead of a depGraph', async () => {
    inspect.mockResolvedValueOnce({ scannedProjects: [{ depTree: {} }] });

    await expect(() =>
      getDependencies(ctx, {
        rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toThrowError();
  });

  it('should error unless only one scannedProject is returned from inspect', async () => {
    inspect.mockResolvedValueOnce({ scannedProjects: [{ depGraph: {} }, { depGraph: {} }] });

    await expect(() =>
      getDependencies(ctx, {
        rootPath: path.join(__dirname, '../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toThrowError();
  });
});
