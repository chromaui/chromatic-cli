import { describe, expect, it } from 'vitest';

import { Module } from '../../../types';
import {
  canonicalFileNames,
  canonicalImporters,
  isNodeModulesPath,
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
      name: 'returns nothing when the module has no reasons',
      module: module({ name: './src/Button.tsx' }),
      expected: [],
    },
  ])('$name', ({ module: input, expected }) => {
    expect(canonicalImporters(input, roots)).toEqual(expected);
  });
});

describe('normalizeStatsPath', () => {
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
