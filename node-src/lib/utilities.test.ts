import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import {
  groupUntracedFilesByGlob,
  isPackageLockFile,
  isPackageManifestFile,
  isPackageMetadataFile,
  matchesFile,
  redact,
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
  it('redacts sensitive keys at any depth', () => {
    const input = { a: { projectToken: 'x', b: [{ userToken: 'y' }] }, reportToken: 'z' };
    expect(redact(input)).toEqual({
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
    expect(redact(input)).toEqual(input);
  });

  it('scrubs values collected from sensitive-keyed subtrees everywhere, arrays included', () => {
    // Repeated flags keep every value in flags.projectToken while options.projectToken only
    // keeps the last — the collection walk must catch all of them inside originalArgv.
    const input = {
      flags: { projectToken: ['first-secret', 'second-secret'] },
      options: {
        projectToken: 'second-secret',
        originalArgv: ['-t', 'first-secret', '-t', 'second-secret'],
      },
    };
    expect(redact(input)).toEqual({
      flags: { projectToken: undefined },
      options: {
        projectToken: undefined,
        originalArgv: ['-t', '<redacted>', '-t', '<redacted>'],
      },
    });
  });

  it('scrubs secrets contributed by secret sources without serializing the source', () => {
    expect(
      redact(
        { options: { originalArgv: ['--project-token=env-secret-value'] } },
        { CHROMATIC_PROJECT_TOKEN: 'env-secret-value' }
      )
    ).toEqual({ options: { originalArgv: ['--project-token=<redacted>'] } });
  });

  it('skips empty strings under sensitive keys so the output is not mangled', () => {
    // An exported-but-empty env var or `-t ""` yields '' under a sensitive key;
    // collecting it would make replaceAll('') wedge the placeholder between every character.
    expect(
      redact(
        { projectToken: '', text: 'plain text', options: { originalArgv: ['-t'] } },
        { CHROMATIC_PROJECT_TOKEN: '' }
      )
    ).toEqual({
      projectToken: undefined,
      text: 'plain text',
      options: { originalArgv: ['-t'] },
    });
  });

  it('replaces longer secrets before shorter prefixes of them', () => {
    expect(redact({ projectToken: 'XYZ', reportToken: 'XYZextra', v: 'XYZextra-suffix' })).toEqual({
      projectToken: undefined,
      reportToken: undefined,
      v: '<redacted>-suffix',
    });
  });

  it('replaces each occurrence of a secret and preserves surrounding text', () => {
    const input = {
      projectToken: 'shhh',
      argv: ['-t', 'shhh', '-t=shhh', '--project-token=shhh', 'keep'],
    };
    expect(redact(input)).toEqual({
      projectToken: undefined,
      argv: ['-t', '<redacted>', '-t=<redacted>', '--project-token=<redacted>', 'keep'],
    });
  });

  it('scrubs a plain string using secrets from secret sources', () => {
    expect(
      redact('a shhh and shhh plus sekrit', { projectToken: 'shhh', reportToken: 'sekrit' })
    ).toBe('a <redacted> and <redacted> plus <redacted>');
  });

  it('redacts the credential of a bare Bearer value, keeping the scheme', () => {
    expect(redact({ h: 'Bearer abc.def.ghi', note: 'mentions bearer mid-string' })).toEqual({
      h: 'Bearer <redacted>',
      note: 'mentions bearer mid-string',
    });
  });

  it('redacts embedded Authorization header credentials in strings', () => {
    expect(
      redact({
        script: 'curl -H "Authorization: Bearer abc.def.ghi" https://example.com',
        basic: 'curl -H "Authorization: Basic dXNlcjpwYXNz" https://example.com',
        mention: 'mentions bearer mid-string',
      })
    ).toEqual({
      script: 'curl -H "Authorization: Bearer <redacted>" https://example.com',
      basic: 'curl -H "Authorization: Basic <redacted>" https://example.com',
      mention: 'mentions bearer mid-string',
    });
  });

  it('leaves ordinary strings starting with Basic untouched', () => {
    // "Basic" is an ordinary word; only a bare Bearer value at string start is redacted,
    // so Basic stays intact without the authorization: anchor.
    expect(redact({ story: 'Basic usage', message: 'Basic auth support' })).toEqual({
      story: 'Basic usage',
      message: 'Basic auth support',
    });
  });

  it('leaves non-string values and structures untouched', () => {
    const input = { n: 1, b: true, nil: null, nested: { s: 'ok', arr: [1, 'ok'] } };
    expect(redact(input)).toEqual(input);
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
