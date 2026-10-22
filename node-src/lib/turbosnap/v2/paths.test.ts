/* eslint-disable max-lines */
import { describe, expect, it } from 'vitest';

import { Module } from '../../../types';
import {
  canonicalFileNames,
  canonicalImporters,
  foldStatsId,
  gitRootGlobMatcher,
  isInstalledPackagePath,
  isNodeModulesPath,
  isSyntheticFile,
  moduleFileNames,
  normalizeStatsPath,
  resolveStatsPath,
  rootFilePath,
} from './paths';

const projectRoot = '/repo/packages/ui';
const roots = { projectRoot, statsRoot: projectRoot };

function module(module: Partial<Module>): Module {
  return { id: 0, name: '', ...module };
}

describe('moduleFileNames', () => {
  it('names a plain module by itself', () => {
    expect(moduleFileNames(module({ name: './src/Button.tsx' }))).toEqual(['./src/Button.tsx']);
  });

  it('prefers nameForCondition over name', () => {
    expect(
      moduleFileNames(
        module({ name: './src/Button.tsx', nameForCondition: '/repo/src/Button.tsx' })
      )
    ).toEqual(['/repo/src/Button.tsx']);
  });

  it('lists the root first, then the concatenated members', () => {
    expect(
      moduleFileNames(
        module({
          name: './src/Button.stories.tsx + 1 modules',
          modules: [{ name: './src/Button.stories.tsx' }, { name: './src/Button.tsx' }],
        })
      )
    ).toEqual(['./src/Button.stories.tsx', './src/Button.tsx']);
  });

  it("roots at the module's own name, never at modules[0]", () => {
    // storybook-builder-rsbuild 3.3.0/3.3.1 fills `modules` with the record's require-contexts (a
    // glob) rather than its concatenated files. The root must still come from the module's own name,
    // or the glob would become the root and promote the whole record to a story importer.
    expect(
      moduleFileNames(
        module({
          name: './src/Button.stories.tsx',
          modules: [{ name: String.raw`./src sync recursive \.stories\.tsx$` }],
        })
      )[0]
    ).toBe('./src/Button.stories.tsx');
  });

  it('strips the concatenation suffix from the root and every member', () => {
    expect(
      moduleFileNames(
        module({
          name: './src/a.ts + 2 modules',
          modules: [{ name: './src/b.ts + 1 module' }, { name: './src/c.ts' }],
        })
      )
    ).toEqual(['./src/a.ts', './src/b.ts', './src/c.ts']);
  });

  it('drops duplicates so a suffixed root never repeats a member spelling the same file', () => {
    expect(
      moduleFileNames(
        module({
          name: './src/a.ts + 1 modules',
          modules: [{ name: './src/a.ts' }, { name: './src/b.ts' }],
        })
      )
    ).toEqual(['./src/a.ts', './src/b.ts']);
  });

  it('drops empty names', () => {
    expect(
      moduleFileNames(
        module({ name: './src/a.ts', modules: [{ name: '' }, { name: './src/b.ts' }] })
      )
    ).toEqual(['./src/a.ts', './src/b.ts']);
  });

  it('returns nothing when the module names no files', () => {
    expect(moduleFileNames(module({ name: '' }))).toEqual([]);
  });
});

describe('rootFilePath', () => {
  it('normalizes the root name against the project root', () => {
    expect(rootFilePath(module({ name: '/repo/packages/ui/src/Button.tsx' }), roots)).toBe(
      './src/Button.tsx'
    );
  });

  it("takes the root from the module's own name, not a require-context glob in modules", () => {
    // Same rsbuild quirk as moduleFileNames: the glob in `modules` has no file on disk, so rooting
    // there would resolve to a phantom path instead of the real story file.
    expect(
      rootFilePath(
        module({
          name: './src/Button.stories.tsx',
          modules: [{ name: String.raw`./src sync recursive \.stories\.tsx$` }],
        }),
        roots
      )
    ).toBe('./src/Button.stories.tsx');
  });

  it('returns undefined when the module names no files', () => {
    expect(rootFilePath(module({ name: '' }), roots)).toBeUndefined();
  });
});

describe('canonicalFileNames', () => {
  it.each([
    {
      name: 'a module that names no files',
      module: module({ name: '' }),
      expected: [],
    },
    {
      name: 'a plain module',
      module: module({ name: '/repo/packages/ui/src/Button.tsx' }),
      expected: ['./src/Button.tsx'],
    },
    {
      name: 'a concatenated module, root first',
      module: module({
        name: '/repo/packages/ui/src/Button.stories.tsx + 1 modules',
        modules: [
          { name: '/repo/packages/ui/src/Button.stories.tsx' },
          { name: '/repo/packages/ui/src/Button.tsx' },
        ],
      }),
      expected: ['./src/Button.stories.tsx', './src/Button.tsx'],
    },
    {
      name: 'a NUL proxy module name, folded onto the real file',
      module: module({ name: '\0./../../node_modules/react/index.js?commonjs-module' }),
      expected: ['../../node_modules/react/index.js'],
    },
  ])('normalizes the file names of $name', ({ module: input, expected }) => {
    expect(canonicalFileNames(input, roots)).toEqual(expected);
  });
});

describe('canonicalImporters', () => {
  it.each([
    {
      name: 'drops reasons with a null moduleName',
      module: module({
        reasons: [{ moduleName: null }, { moduleName: '/repo/packages/ui/src/Button.tsx' }],
      }),
      expected: ['./src/Button.tsx'],
    },
    {
      name: 'normalizes string moduleNames',
      module: module({
        reasons: [
          { moduleName: '/repo/packages/ui/src/a.ts' },
          { moduleName: '/repo/packages/shared/theme.ts' },
        ],
      }),
      expected: ['./src/a.ts', '../shared/theme.ts'],
    },
    {
      name: 'folds a proxy reason moduleName onto the real file',
      module: module({
        name: './src/Button.stories.tsx',
        reasons: [{ moduleName: '\0./src/Foo.vue?vue&type=script&lang.ts' }],
      }),
      expected: ['./src/Foo.vue'],
    },
    {
      name: 'returns nothing when the module has no reasons',
      module: module({ name: './src/Button.tsx' }),
      expected: [],
    },
  ])('$name', ({ module: input, expected }) => {
    expect(canonicalImporters(input, roots)).toEqual(expected);
  });
});

describe('normalizeStatsPath', () => {
  it('leaves inline data URLs unchanged', () => {
    const dataUrl = 'data:font/ttf;base64,AAAAAAAAAAAAAAAAAA';

    expect(normalizeStatsPath(dataUrl, projectRoot)).toBe(dataUrl);
  });

  it('keeps a literal ? in a real on-disk filename, since no fold runs here', () => {
    expect(normalizeStatsPath('/repo/packages/ui/public/what?.svg', projectRoot)).toBe(
      './public/what?.svg'
    );
  });

  it('keys a file with a literal ? apart from the same name without it', () => {
    expect(normalizeStatsPath('/repo/packages/ui/public/what', projectRoot)).not.toBe(
      normalizeStatsPath('/repo/packages/ui/public/what?.svg', projectRoot)
    );
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

describe('foldStatsId', () => {
  it.each([
    {
      name: 'a NUL proxy for a relative CommonJS module',
      id: '\0./../../node_modules/react/index.js?commonjs-module',
      expected: './../../node_modules/react/index.js',
    },
    {
      name: 'a query-suffixed framework block',
      id: './src/Foo.vue?vue&type=script&lang.ts',
      expected: './src/Foo.vue',
    },
    {
      name: 'a query-suffixed html proxy entry',
      id: './iframe.html?html-proxy&inline-css&index=0.css',
      expected: './iframe.html',
    },
    {
      name: 'an ordinary path whose segment ends in a mode token',
      id: './src/tweak panel.tsx?raw',
      expected: './src/tweak panel.tsx',
    },
    {
      name: 'an ordinary path whose directory ends in lazy',
      id: './src/Clazy icons.svg?url',
      expected: './src/Clazy icons.svg',
    },
  ])('folds $name onto the file it stands for', ({ id, expected }) => {
    expect(foldStatsId(id)).toBe(expected);
  });

  it.each([
    ['a bare NUL module', '\0commonjsHelpers.js'],
    ['a bare NUL module with a query', '\0vite/preload-helper.js?commonjs-module'],
    ['an absolute opaque id', '\0/@data-uri/data:text/javascript,export default 1'],
    ['a virtual module', 'virtual:@storybook/builder-vite/vite-app.js'],
    ['an inline data URL', 'data:font/ttf;base64,AAAAAAAAAAAAAAAAAA'],
  ])('leaves %s unchanged, since no file stands behind it', (_name, id) => {
    expect(foldStatsId(id)).toBe(id);
  });

  it.each([
    [
      'a webpack loader chain',
      '../../node_modules/css-loader/dist/cjs.js??ruleSet[1].rules[4].use[1]!./src/lib/PathDerived/styles.module.css',
    ],
    [
      'an rsbuild context name with a negative lookahead',
      String.raw`./src sync ^\.\/(?!.*node_modules).*\.stories\.tsx$?query`,
    ],
    [
      'a webpack lazy context name with a query',
      String.raw`./src lazy ^\.\/.*\.stories\.(?:ts|tsx)$?query`,
    ],
    [
      'an rspack lazy context name with a query',
      String.raw`./src|lazy|/^\.\/.*$/|include: /(?:\.stories\.tsx)$?query`,
    ],
    [
      'a webpack sync context name with a query',
      String.raw`./src sync ^\.\/.*\.stories\.(?:ts|tsx)$?query`,
    ],
    [
      'an rspack sync context name with a query',
      String.raw`./src|sync|/^\.\/.*$/|include: /(?:\.stories\.tsx)$?query`,
    ],
    [
      'a webpack eager context name with a query',
      String.raw`./icons eager ^\.\/.*\.(?:svg)$?query`,
    ],
    ['a webpack weak context name with a query', String.raw`./icons weak ^\.\/.*\.(?:svg)$?query`],
    [
      'a webpack async-weak context name with a query',
      String.raw`./icons async-weak ^\.\/.*\.(?:svg)$?query`,
    ],
    [
      'a webpack lazy-once context name with a query',
      String.raw`./icons lazy-once nonrecursive ^\.\/.*\.(?:svg)$?query`,
    ],
    [
      'a webpack lazy context whose request ends in a slash',
      String.raw`./src/lib/ lazy /^\.\/.*$/?query`,
    ],
    [
      'a webpack weak context named after a deep directory',
      String.raw`./packages/website/containers/ weak ^\.\/.*\.(?:ts|tsx)$?query`,
    ],
    [
      'an rspack eager context name with a query',
      String.raw`./icons|eager|/^\.\/.*$/|include: /(?:svg)$?query`,
    ],
    [
      'an rspack weak context name with a query',
      String.raw`./icons|weak|/^\.\/.*$/|include: /(?:svg)$?query`,
    ],
    [
      'an rspack async-weak context name with a query',
      String.raw`./icons|async-weak|/^\.\/.*$/|include: /(?:svg)$?query`,
    ],
    [
      'an rspack lazy-once context name with a query',
      String.raw`./icons|lazy-once|/^\.\/.*$/|include: /(?:svg)$?query`,
    ],
  ])('keeps the ? of %s', (_name, id) => {
    expect(foldStatsId(id)).toBe(id);
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

  it('resolves a loader chain with its ? intact, so the loader file is never hashed instead', () => {
    const id =
      '../../node_modules/css-loader/dist/cjs.js??ruleSet[1].rules[4].use[1]!./src/lib/PathDerived/styles.module.css';

    expect(resolveStatsPath(id, projectRoot)).toBe(
      '/repo/node_modules/css-loader/dist/cjs.js??ruleSet[1].rules[4].use[1]!./src/lib/PathDerived/styles.module.css'
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

describe('isInstalledPackagePath', () => {
  it.each([
    ['a hoisted package', './node_modules/react/index.js'],
    ['an absolute package path', '/repo/node_modules/react/index.js'],
    [
      'a package in the pnpm virtual store',
      './node_modules/.pnpm/react@19.0.0/node_modules/react/index.js',
    ],
    [
      'a package in the Bun isolated store',
      './node_modules/.bun/react@19.0.0/node_modules/react/index.js',
    ],
    [
      'a package in the Deno store',
      './node_modules/.deno/react@19.0.0/node_modules/react/index.js',
    ],
    ['a nested workspace package', './packages/ui/node_modules/lodash/lodash.js'],
    ['a package nested in another', './node_modules/a/node_modules/b/index.js'],
    ['a package whose own directory is named .cache', './node_modules/react/.cache/index.js'],
    ['a package whose name only starts with .cache', './node_modules/.cache-loader/index.js'],
    ['a package path with Windows separators', String.raw`C:\repo\node_modules\react\index.js`],
    ['a Vite pre-bundled copy of a package', '/repo/node_modules/.vite/deps/react.js'],
  ])('is true for %s', (_description, filePath) => {
    expect(isInstalledPackagePath(filePath)).toBe(true);
  });

  it.each([
    ['a module federation entry', './node_modules/.federation/entry.3f2a1b.js'],
    [
      'a build cache file',
      './node_modules/.cache/storybook/default/dev-server/storybook-stories.js',
    ],
    [
      'a cache in a nested workspace package',
      './packages/ui/node_modules/.cache/babel-loader/x.json',
    ],
    [
      'a cache inside a pnpm store package',
      './node_modules/.pnpm/a@1.0.0/node_modules/.cache/x.js',
    ],
    [
      'a federation entry with Windows separators',
      String.raw`C:\repo\node_modules\.federation\entry.js`,
    ],
    ['a project source file', './src/Button.tsx'],
    ['a .cache directory outside node_modules', './.cache/node_modules-like/x.js'],
    ['a project directory named .cache', './src/.cache/x.js'],
  ])('is false for %s', (_description, filePath) => {
    expect(isInstalledPackagePath(filePath)).toBe(false);
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

describe('isSyntheticFile NUL proxy classification', () => {
  it.each([
    ['a bare NUL runtime helper', '\0commonjsHelpers.js'],
    ['a bare NUL Vite preload helper', '\0vite/preload-helper.js'],
    ['a bare NUL Vite modulepreload polyfill', '\0vite/modulepreload-polyfill.js'],
    ['a bare NUL framework helper', '\0plugin-vue:export-helper'],
    ['a NUL-prefixed opaque rooted id', '\0/@data-uri/data:text/javascript,export default 1'],
  ])('classifies %s as synthetic', (_name, id) => {
    expect(isSyntheticFile(id)).toBe(true);
  });

  it('does not classify a NUL proxy for a relative path as synthetic, since it folds onto a real file', () => {
    expect(isSyntheticFile('\0./../../node_modules/react/index.js?commonjs-module')).toBe(false);
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
