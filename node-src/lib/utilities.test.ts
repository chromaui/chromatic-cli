import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import {
  groupUntracedFilesByGlob,
  isPackageLockFile,
  isPackageManifestFile,
  isPackageMetadataFile,
  matchesFile,
} from './utilities';

chalk.level = 0;

describe('matchesFile', () => {
  it('matches file names', () => {
    expect(matchesFile('file.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('file.js', 'test.js')).toStrictEqual(false);
    expect(matchesFile('file.js', 'file.ts')).toStrictEqual(false);
  });

  it('matches file name patterns', () => {
    expect(matchesFile('*.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('*.js', 'file.ts')).toStrictEqual(false);
    expect(matchesFile('*.stories.js', 'test.stories.js')).toStrictEqual(true);
    expect(matchesFile('*.stories.js', 'test.js')).toStrictEqual(false);
  });

  it('matches file extension patterns', () => {
    expect(matchesFile('*.[jt]s', 'file.js')).toStrictEqual(true);
    expect(matchesFile('*.[jt]s', 'file.ts')).toStrictEqual(true);
  });

  it('matches directory patterns', () => {
    expect(matchesFile('*/file.js', 'src/file.js')).toStrictEqual(true);
    expect(matchesFile('*/file.js', 'file.js')).toStrictEqual(false);
    expect(matchesFile('**/file.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('**/file.js', 'path/to/file.js')).toStrictEqual(true);
  });

  it('matches dotfiles', () => {
    expect(matchesFile('src/*', 'src/.dotfile')).toStrictEqual(true);
  });

  it('matches ./ prefix', () => {
    expect(matchesFile('src/*', './src/file.js')).toStrictEqual(true);
  });
});

describe('groupUntracedFilesByGlob', () => {
  it('groups files matched by the same glob together', () => {
    const result = groupUntracedFilesByGlob([
      { filepath: 'src/stories/Button.jsx', glob: '**/stories/**' },
      { filepath: 'package.json', glob: '**/package.json' },
      { filepath: 'src/stories/Page.jsx', glob: '**/stories/**' },
    ]);
    expect(result).toBe(
      [
        'Files matching **/stories/**:',
        '→ src/stories/Button.jsx',
        '→ src/stories/Page.jsx',
        'Files matching **/package.json:',
        '→ package.json',
      ].join('\n')
    );
  });

  it('lists a single matched file under its glob', () => {
    const result = groupUntracedFilesByGlob([
      { filepath: 'package.json', glob: '**/package.json' },
    ]);
    expect(result).toBe('Files matching **/package.json:\n→ package.json');
  });
});

describe('isPackageManifestFile', () => {
  it('returns true for package manifest file at root', () => {
    expect(isPackageManifestFile('package.json')).toBe(true);
  });

  it('returns true for package manifest file in directory', () => {
    expect(isPackageManifestFile('path/to/package.json')).toBe(true);
  });

  it('returns false for non-package-manifest files at root', () => {
    expect(isPackageManifestFile('something.json')).toBe(false);
  });

  it('returns false for non-package-manifest files in directory', () => {
    expect(isPackageManifestFile('path/to/something.json')).toBe(false);
  });
});

describe('isPackageLockFile', () => {
  it.each(['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'])(
    'returns true for %s at the root or in a directory',
    (lockfile) => {
      expect(isPackageLockFile(lockfile)).toBe(true);
      expect(isPackageLockFile(`path/to/${lockfile}`)).toBe(true);
    }
  );

  it('returns false for other files', () => {
    expect(isPackageLockFile('pnpm-workspace.yaml')).toBe(false);
    expect(isPackageLockFile('not-yarn.lock')).toBe(false);
  });
});

describe('isPackageMetadataFile', () => {
  it('recognizes manifests and lockfiles', () => {
    expect(isPackageMetadataFile('packages/ui/package.json')).toBe(true);
    expect(isPackageMetadataFile('pnpm-lock.yaml')).toBe(true);
  });

  it('does not recognize other package manager files', () => {
    expect(isPackageMetadataFile('pnpm-workspace.yaml')).toBe(false);
    expect(isPackageMetadataFile('.npmrc')).toBe(false);
  });
});
