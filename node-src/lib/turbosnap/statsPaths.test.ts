import { describe, expect, it } from 'vitest';

import { Module } from '../../types';
import { isNodeModulesPath, moduleFileNames } from './statsPaths';

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
