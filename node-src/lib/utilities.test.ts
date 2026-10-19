import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import {
  groupUntracedFilesByGlob,
  isPackageLockFile,
  isPackageManifestFile,
  isPackageMetadataFile,
  matchesFile,
  redact,
  redactValues,
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

describe('redact', () => {
  it('redacts exact-name keys at any depth', () => {
    const input = { a: { projectToken: 'x', b: [{ userToken: 'y' }] }, reportToken: 'z' };
    expect(redact(input, 'projectToken', 'reportToken', 'userToken')).toEqual({
      a: { projectToken: undefined, b: [{ userToken: undefined }] },
      reportToken: undefined,
    });
  });

  it('redacts keys matching the sensitive-name pattern case-insensitively', () => {
    const input = {
      CHROMATIC_PROJECT_TOKEN: 'a',
      myToken: 'b',
      authorization: 'c',
      Authorization: 'd',
      keepMe: 'e',
      nested: { sessionTOKEN: 'f' },
    };
    expect(redact(input)).toEqual({
      CHROMATIC_PROJECT_TOKEN: undefined,
      myToken: undefined,
      authorization: undefined,
      Authorization: undefined,
      keepMe: 'e',
      nested: { sessionTOKEN: undefined },
    });
  });

  it('leaves non-sensitive keys untouched', () => {
    const input = { keep: 'x', nested: { alsoKeep: ['y'] } };
    expect(redact(input, 'projectToken')).toEqual(input);
  });
});

describe('redactValues', () => {
  it('replaces each occurrence of a secret and preserves surrounding text', () => {
    const input = { argv: ['-t', 'shhh', '-t=shhh', '--project-token=shhh', 'keep'] };
    expect(redactValues(input, ['shhh'])).toEqual({
      argv: ['-t', '<redacted>', '-t=<redacted>', '--project-token=<redacted>', 'keep'],
    });
  });

  it('handles multiple secrets and repeated occurrences', () => {
    expect(redactValues('a shhh and shhh plus sekrit', ['shhh', 'sekrit'])).toBe(
      'a <redacted> and <redacted> plus <redacted>'
    );
  });

  it('replaces bearer values wholesale', () => {
    expect(redactValues({ h: 'Bearer abc.def.ghi', note: 'mentions bearer mid-string' }, [])).toEqual(
      {
        h: '<redacted>',
        note: 'mentions bearer mid-string',
      }
    );
  });

  it('leaves non-string values and structures untouched', () => {
    const input = { n: 1, b: true, nil: null, nested: { s: 'ok', arr: [1, 'ok'] } };
    expect(redactValues(input, ['nothere'])).toEqual(input);
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
