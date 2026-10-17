import { describe, expect, it } from 'vitest';

import {
  gitRootGlobMatcher,
  isNodeModulesPath,
  isSyntheticFile,
  normalizeStatsPath,
  resolveStatsPath,
} from './paths';

const projectRoot = '/repo/packages/ui';

describe('normalizeStatsPath', () => {
  it('leaves inline data URLs unchanged', () => {
    const dataUrl = 'data:font/ttf;base64,AAAAAAAAAAAAAAAAAA';

    expect(normalizeStatsPath(dataUrl, projectRoot)).toBe(dataUrl);
  });

  it('keeps a project-relative path as-is, with its ./ prefix', () => {
    expect(normalizeStatsPath('./src/Button.stories.tsx', projectRoot)).toBe(
      './src/Button.stories.tsx'
    );
  });

  it('relativizes an absolute path against the project root', () => {
    expect(normalizeStatsPath('/repo/packages/ui/src/Button.stories.tsx', projectRoot)).toBe(
      './src/Button.stories.tsx'
    );
  });

  it('gives a sibling-package dependency a ../ prefix instead of ./', () => {
    expect(normalizeStatsPath('/repo/packages/shared/theme.ts', projectRoot)).toBe(
      '../shared/theme.ts'
    );
  });

  it('normalizes a hoisted node_modules path the same way from either spelling', () => {
    // Vite writes `./../../node_modules/...`; rspack writes the absolute path. Both should
    // normalize to the same key.
    expect(
      normalizeStatsPath('./../../node_modules/@storybook/react/dist/entry-preview.js', projectRoot)
    ).toBe('../../node_modules/@storybook/react/dist/entry-preview.js');
    expect(
      normalizeStatsPath('/repo/node_modules/@storybook/react/dist/entry-preview.js', projectRoot)
    ).toBe('../../node_modules/@storybook/react/dist/entry-preview.js');
  });

  it('returns virtual modules unchanged', () => {
    expect(
      normalizeStatsPath('virtual:@storybook/builder-vite/storybook-stories.js', projectRoot)
    ).toBe('virtual:@storybook/builder-vite/storybook-stories.js');
  });

  it('strips a trailing " + N modules" suffix from a concatenated module name', () => {
    expect(normalizeStatsPath('./src/lib/Button/Button.stories.tsx + 1 modules', projectRoot)).toBe(
      './src/lib/Button/Button.stories.tsx'
    );
  });

  it('strips a singular " + 1 module" suffix', () => {
    expect(normalizeStatsPath('./src/a.ts + 1 module', projectRoot)).toBe('./src/a.ts');
  });

  it('keys a NUL-escaped filename by the name it really has on disk', () => {
    expect(normalizeStatsPath('./node_modules/es5-ext/array/\0#/e-index-of.js', projectRoot)).toBe(
      './node_modules/es5-ext/array/#/e-index-of.js'
    );
  });

  it('resolves a relative stats path against statsRoot, not the project root', () => {
    // A builder may name relative paths from the repository root even though manifest keys anchor at
    // the project, so the same file has to normalize back to a project-relative key.
    expect(normalizeStatsPath('./packages/ui/src/Button.stories.tsx', projectRoot, '/repo')).toBe(
      './src/Button.stories.tsx'
    );
  });
});

describe('resolveStatsPath', () => {
  it('resolves a relative path against the project root', () => {
    expect(resolveStatsPath('./src/x.ts', projectRoot)).toBe('/repo/packages/ui/src/x.ts');
  });

  it('returns an absolute path unchanged', () => {
    expect(resolveStatsPath('/repo/packages/shared/theme.ts', projectRoot)).toBe(
      '/repo/packages/shared/theme.ts'
    );
  });

  it.each([
    [
      "webpack's escape for a literal hash",
      './node_modules/es5-ext/array/\0#/e-index-of.js',
      '/repo/packages/ui/node_modules/es5-ext/array/#/e-index-of.js',
    ],
    ['several escapes in one path', './a/\0#/b/\0#/c.js', '/repo/packages/ui/a/#/b/#/c.js'],
    ['a marker with nothing after it', './src/Button.tsx\0', '/repo/packages/ui/src/Button.tsx'],
    [
      'an escape alongside a concatenation suffix',
      './node_modules/es5-ext/array/\0#/e-index-of.js + 2 modules',
      '/repo/packages/ui/node_modules/es5-ext/array/#/e-index-of.js',
    ],
  ])('strips %s', (_name, statsPath, expected) => {
    expect(resolveStatsPath(statsPath, projectRoot)).toBe(expected);
  });

  it('leaves an unescaped hash alone, since webpack reads it as a fragment', () => {
    expect(resolveStatsPath('./src/Button.tsx#fragment', projectRoot)).toBe(
      '/repo/packages/ui/src/Button.tsx#fragment'
    );
  });
});

describe('isNodeModulesPath', () => {
  it.each([
    ['canonical project-relative path', './node_modules/react/index.js'],
    ['bare relative path', 'node_modules/react/index.js'],
    ['absolute POSIX path', '/repo/node_modules/react/index.js'],
    ['nested node_modules', './node_modules/a/node_modules/b/index.js'],
    ['Windows backslash separators', String.raw`C:\repo\node_modules\react\index.js`],
    ['segment at the end of the path', './packages/ui/node_modules'],
    ['segment at the start of the path', 'node_modules'],
  ])('is true for a %s', (_description, filePath) => {
    expect(isNodeModulesPath(filePath)).toBe(true);
  });

  it.each([
    ['a project source file', './src/Button.stories.tsx'],
    ['an absolute source file', '/repo/packages/ui/src/Button.tsx'],
    ['a file merely named node_modules', './src/node_modules.ts'],
    ['a segment that only starts with node_modules', './src/node_modules_backup/x.ts'],
    ['a segment that only ends with node_modules', './src/my_node_modules/x.ts'],
    ['an empty path', ''],
  ])('is false for %s', (_description, filePath) => {
    expect(isNodeModulesPath(filePath)).toBe(false);
  });
});

describe('isSyntheticFile', () => {
  it('recognizes an inline data URL by its leading scheme', () => {
    expect(isSyntheticFile('data:font/ttf;base64,AAAAAAAAAAAAAAAAAA')).toBe(true);
  });

  it('does not mistake a real path containing data: for a synthetic module', () => {
    expect(isSyntheticFile('/repo/packages/data:exports/src/font.ts')).toBe(false);
  });
});

describe('gitRootGlobMatcher', () => {
  it('matches a glob against the posix path relative to the repository root', () => {
    const isMatch = gitRootGlobMatcher('/repo', ['packages/ui/src/generated/**']);

    expect(isMatch('/repo/packages/ui/src/generated/schema.ts')).toBe(true);
    expect(isMatch('/repo/packages/ui/src/Button.tsx')).toBe(false);
  });

  it('ignores an empty glob, which picomatch rejects, so an empty flag or configuration entry names nothing', () => {
    const isMatch = gitRootGlobMatcher('/repo', ['', '**/*.css']);

    expect(isMatch('/repo/packages/ui/src/theme.css')).toBe(true);
    expect(isMatch('/repo/packages/ui/src/Button.tsx')).toBe(false);
  });
});
