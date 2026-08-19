import { describe, expect, it } from 'vitest';

import { normalizeStatsPath, resolveStatsPath } from './paths';

const projectRoot = '/repo/packages/ui';

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
