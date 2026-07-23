import { describe, expect, it } from 'vitest';

import { normalizeStatsPath, resolveStatsPath } from './paths';

const projectRoot = '/repo/packages/ui';

describe('normalizeStatsPath', () => {
  it('strips a leading ./ from an already project-relative path', () => {
    expect(normalizeStatsPath('./src/Button.stories.tsx', projectRoot)).toBe(
      'src/Button.stories.tsx'
    );
  });

  it('relativizes an absolute path against the project root', () => {
    expect(normalizeStatsPath('/repo/packages/ui/src/Button.stories.tsx', projectRoot)).toBe(
      'src/Button.stories.tsx'
    );
  });

  it('keeps external dependencies as a ../ path relative to the project root', () => {
    expect(normalizeStatsPath('/repo/packages/shared/theme.ts', projectRoot)).toBe(
      '../shared/theme.ts'
    );
  });

  it('returns virtual modules unchanged', () => {
    expect(
      normalizeStatsPath('virtual:@storybook/builder-vite/storybook-stories.js', projectRoot)
    ).toBe('virtual:@storybook/builder-vite/storybook-stories.js');
  });

  it('strips a trailing " + N modules" suffix from a concatenated module name', () => {
    expect(
      normalizeStatsPath('./src/lib/Button/Button.stories.tsx + 1 modules', projectRoot)
    ).toBe('src/lib/Button/Button.stories.tsx');
  });

  it('strips a singular " + 1 module" suffix', () => {
    expect(normalizeStatsPath('./src/a.ts + 1 module', projectRoot)).toBe('src/a.ts');
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
