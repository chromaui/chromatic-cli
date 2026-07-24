import { describe, expect, it } from 'vitest';

import { normalizeStatsPath, resolveStatsPath } from './paths';

const projectRoot = '/repo/packages/ui';
const gitRoot = '/repo';
const roots = { projectRoot, gitRoot };

describe('normalizeStatsPath', () => {
  it('anchors a project-relative path at the git root, stripping the leading ./', () => {
    expect(normalizeStatsPath('./src/Button.stories.tsx', roots)).toBe(
      'packages/ui/src/Button.stories.tsx'
    );
  });

  it('relativizes an absolute path against the git root', () => {
    expect(normalizeStatsPath('/repo/packages/ui/src/Button.stories.tsx', roots)).toBe(
      'packages/ui/src/Button.stories.tsx'
    );
  });

  it('keeps a sibling-package dependency as a repo-relative path', () => {
    expect(normalizeStatsPath('/repo/packages/shared/theme.ts', roots)).toBe(
      'packages/shared/theme.ts'
    );
  });

  it('returns virtual modules unchanged', () => {
    expect(normalizeStatsPath('virtual:@storybook/builder-vite/storybook-stories.js', roots)).toBe(
      'virtual:@storybook/builder-vite/storybook-stories.js'
    );
  });

  it('strips a trailing " + N modules" suffix from a concatenated module name', () => {
    expect(normalizeStatsPath('./src/lib/Button/Button.stories.tsx + 1 modules', roots)).toBe(
      'packages/ui/src/lib/Button/Button.stories.tsx'
    );
  });

  it('strips a singular " + 1 module" suffix', () => {
    expect(normalizeStatsPath('./src/a.ts + 1 module', roots)).toBe('packages/ui/src/a.ts');
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
