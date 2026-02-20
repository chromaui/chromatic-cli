import { describe, expect, it } from 'vitest';

import {
  filterChangedFilesByBaseDir,
  filterPackageMetadataByBaseDir,
} from './filterGitChanges';

describe('filterChangedFilesByBaseDir', () => {
  it('returns all files when baseDir is "."', () => {
    const files = ['web/src/a.js', 'api/src/b.js', 'package.json'];
    expect(filterChangedFilesByBaseDir('.', files)).toEqual(files);
  });

  it('returns all files when baseDir is empty', () => {
    const files = ['web/src/a.js', 'api/src/b.js', 'package.json'];
    expect(filterChangedFilesByBaseDir('', files)).toEqual(files);
  });

  it('returns all files when baseDir is "./"', () => {
    const files = ['web/src/a.js', 'api/src/b.js'];
    expect(filterChangedFilesByBaseDir('./', files)).toEqual(files);
  });

  it('filters files to only those under baseDir', () => {
    const files = [
      'web/src/App.tsx',
      'web/src/utils.ts',
      'api/src/server.ts',
      'api/src/routes.ts',
      'shared-ui/src/Button.tsx',
    ];
    const result = filterChangedFilesByBaseDir('web', files);
    expect(result).toEqual(['web/src/App.tsx', 'web/src/utils.ts']);
  });

  it('keeps root-level package metadata files', () => {
    const files = [
      'web/src/App.tsx',
      'api/src/server.ts',
      'package.json',
      'yarn.lock',
      'package-lock.json',
    ];
    const result = filterChangedFilesByBaseDir('web', files);
    expect(result).toEqual(['web/src/App.tsx', 'package.json', 'yarn.lock', 'package-lock.json']);
  });

  it('does NOT keep nested package metadata from other workspaces', () => {
    const files = [
      'web/src/App.tsx',
      'api/package.json',
      'api/yarn.lock',
      'shared-ui/package.json',
    ];
    const result = filterChangedFilesByBaseDir('web', files);
    expect(result).toEqual(['web/src/App.tsx']);
  });

  it('handles deeply nested baseDir', () => {
    const files = [
      'packages/apps/web/src/App.tsx',
      'packages/apps/web/src/utils.ts',
      'packages/apps/api/src/server.ts',
      'packages/libs/shared/src/Button.tsx',
      'package.json',
    ];
    const result = filterChangedFilesByBaseDir('packages/apps/web', files);
    expect(result).toEqual([
      'packages/apps/web/src/App.tsx',
      'packages/apps/web/src/utils.ts',
      'package.json',
    ]);
  });

  it('handles baseDir with trailing slash', () => {
    const files = ['web/src/App.tsx', 'api/src/server.ts'];
    const result = filterChangedFilesByBaseDir('web/', files);
    expect(result).toEqual(['web/src/App.tsx']);
  });

  it('does not match partial directory names', () => {
    const files = ['web-admin/src/App.tsx', 'web/src/utils.ts', 'webhook/handler.ts'];
    const result = filterChangedFilesByBaseDir('web', files);
    expect(result).toEqual(['web/src/utils.ts']);
  });

  it('handles empty file list', () => {
    expect(filterChangedFilesByBaseDir('web', [])).toEqual([]);
  });

  it('handles large monorepo scenario (performance check)', () => {
    // Simulate a large monorepo with many changed files
    const otherWorkspaceFiles = Array.from({ length: 1000 }, (_, i) => `api/src/file${i}.ts`);
    const relevantFiles = ['web/src/App.tsx', 'web/src/utils.ts'];
    const files = [...otherWorkspaceFiles, ...relevantFiles, 'package.json'];

    const result = filterChangedFilesByBaseDir('web', files);
    expect(result).toEqual(['web/src/App.tsx', 'web/src/utils.ts', 'package.json']);
  });
});

describe('filterPackageMetadataByBaseDir', () => {
  it('returns all changes when baseDir is "."', () => {
    const changes = [
      { changedFiles: ['api/package.json'], commit: 'abc' },
      { changedFiles: ['web/package.json'], commit: 'def' },
    ];
    expect(filterPackageMetadataByBaseDir('.', changes)).toEqual(changes);
  });

  it('filters to only relevant package metadata changes', () => {
    const changes = [
      { changedFiles: ['api/package.json', 'web/package.json'], commit: 'abc' },
    ];
    const result = filterPackageMetadataByBaseDir('web', changes);
    expect(result).toEqual([{ changedFiles: ['web/package.json'], commit: 'abc' }]);
  });

  it('keeps root-level metadata', () => {
    const changes = [
      { changedFiles: ['package.json', 'yarn.lock', 'api/package.json'], commit: 'abc' },
    ];
    const result = filterPackageMetadataByBaseDir('web', changes);
    expect(result).toEqual([{ changedFiles: ['package.json', 'yarn.lock'], commit: 'abc' }]);
  });

  it('removes change sets that have no relevant files after filtering', () => {
    const changes = [
      { changedFiles: ['api/package.json', 'api/yarn.lock'], commit: 'abc' },
      { changedFiles: ['web/package.json'], commit: 'def' },
    ];
    const result = filterPackageMetadataByBaseDir('web', changes);
    expect(result).toEqual([{ changedFiles: ['web/package.json'], commit: 'def' }]);
  });

  it('handles empty input', () => {
    expect(filterPackageMetadataByBaseDir('web', [])).toEqual([]);
  });
});
