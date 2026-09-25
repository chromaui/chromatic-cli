import fs, { statSync as unmockedStatSync } from 'fs';
import os from 'os';
import path from 'path';
import { inspect as unmockedInspect } from 'snyk-nodejs-plugin';
import { fileURLToPath } from 'url';
import { describe, expect, it, Mock, vi } from 'vitest';

import packageJson from '../../../__mocks__/dependencyChanges/plain/package.json';
import { checkoutFile } from '../../../git/git';
import TestLogger from '../../testLogger';
import { SUPPORTED_LOCK_FILES } from '../../utilities';
import { LockFileParseFailedError, LockFileSizeExceededError } from './errors';
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
        rootPath: path.join(__dirname, '../../../__mocks__/dependencyParsing'),
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
  }, 15_000); // Increase test timeout to account for I/O in CI

  it('should bail if the lock file is too large to parse', async () => {
    statSync.mockReturnValue({ size: MAX_LOCK_FILE_SIZE + 1000 });

    await expect(() =>
      getDependencies(ctx, {
        rootPath: path.join(__dirname, '../../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toBeInstanceOf(LockFileSizeExceededError);
  });

  it('should use MAX_LOCK_FILE_SIZE environment variable, if set', async () => {
    vi.stubEnv('MAX_LOCK_FILE_SIZE', (MAX_LOCK_FILE_SIZE + 2000).toString());
    statSync.mockReturnValue({ size: MAX_LOCK_FILE_SIZE + 1000 });

    const dependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../../../__mocks__/dependencyChanges/plain'),
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
        rootPath: path.join(__dirname, '../../../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toThrowError();
  });

  it('should error unless only one scannedProject is returned from inspect', async () => {
    inspect.mockResolvedValueOnce({ scannedProjects: [{ depGraph: {} }, { depGraph: {} }] });

    await expect(() =>
      getDependencies(ctx, {
        rootPath: path.join(__dirname, '../../../__mocks__/dependencyChanges/plain'),
        manifestPath: 'package.json',
        lockfilePath: 'yarn.lock',
      })
    ).rejects.toThrowError();
  });

  it('wraps inspect rejection in LockFileParseFailedError with cause', async () => {
    const cause = new Error('inspect blew up');
    inspect.mockRejectedValueOnce(cause);

    const promise = getDependencies(ctx, {
      rootPath: path.join(__dirname, '../../../__mocks__/dependencyChanges/plain'),
      manifestPath: 'package.json',
      lockfilePath: 'yarn.lock',
    });

    await expect(promise).rejects.toBeInstanceOf(LockFileParseFailedError);
    await expect(promise).rejects.toMatchObject({ cause });
  });
});

describe('getDependencies in a pnpm workspace', () => {
  const rootPath = path.join(__dirname, '../../../__mocks__/dependencyChanges/pnpm-workspace');
  const manifestPath = 'packages/ui/package.json';
  const lockfilePath = 'pnpm-lock.yaml';

  it('resolves catalog specifiers and keeps workspace links stable', async () => {
    const dependencies = await getDependencies(ctx, { rootPath, manifestPath, lockfilePath });

    // A `workspace:` link has no version in the lockfile, so the parser reports the string
    // 'undefined'. It is the same on HEAD and baseline, so it never shows up as a change.
    expect(dependencies.getDepPkgs()).toEqual([
      { name: '@myorg/shared', version: 'undefined' },
      { name: 'moment', version: '2.30.1' },
    ]);
  });

  it('leaves specifiers unresolved when the manifest is not a workspace member', async () => {
    const dependencies = await getDependencies(ctx, {
      rootPath,
      manifestPath: 'packages/not-a-member/package.json',
      lockfilePath,
    });

    expect(dependencies.getDepPkgs()).toEqual([
      { name: '@myorg/shared', version: 'workspace:*' },
      { name: 'moment', version: 'catalog:' },
    ]);
  });

  it('resolves the root manifest against the root importer', async () => {
    const dependencies = await getDependencies(ctx, {
      rootPath,
      manifestPath: 'package.json',
      lockfilePath,
    });

    expect(dependencies.getDepPkgs()).toEqual([{ name: 'is-number', version: '7.0.0' }]);
  });
});

describe('getDependencies with an unparseable pnpm lockfile', () => {
  it('wraps the parser failure in LockFileParseFailedError with cause', async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatic-pnpm-'));
    fs.writeFileSync(path.join(rootPath, 'package.json'), JSON.stringify({ name: 'broken' }));
    fs.writeFileSync(path.join(rootPath, 'pnpm-lock.yaml'), "lockfileVersion: '42.0'\n");

    const promise = getDependencies(ctx, {
      rootPath,
      manifestPath: 'package.json',
      lockfilePath: 'pnpm-lock.yaml',
    });

    await expect(promise).rejects.toBeInstanceOf(LockFileParseFailedError);
    await expect(promise).rejects.toMatchObject({
      lockfilePath: path.join(rootPath, 'pnpm-lock.yaml'),
      cause: expect.any(Error),
    });
  });
});

describe('getDependencies with a standalone pnpm v5 lockfile', () => {
  it('resolves the manifest even though the lockfile has no importers table', async () => {
    const dependencies = await getDependencies(ctx, {
      rootPath: path.join(__dirname, '../../../__mocks__/dependencyChanges/pnpm-v5'),
      manifestPath: 'package.json',
      lockfilePath: 'pnpm-lock.yaml',
    });

    expect(dependencies.getDepPkgs()).toEqual([{ name: 'is-number', version: '7.0.0' }]);
  });
});
