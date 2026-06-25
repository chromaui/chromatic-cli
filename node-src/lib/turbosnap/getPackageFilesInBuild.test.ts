import { describe, expect, it } from 'vitest';

import { Context, Stats } from '../../types';
import { getPackageFilesInBuild } from './getPackageFilesInBuild';

const makeContext = (rootPath: string, baseDirectory = ''): Context =>
  ({
    git: { rootPath },
    storybook: { baseDir: baseDirectory },
  }) as any;

const makeStats = (names: string[]): Stats => ({
  modules: names.map((name, index) => ({ id: index, name })),
});

describe('getPackageFilesInBuild', () => {
  it('always considers a repository-root package file relevant', () => {
    const ctx = makeContext('/repo');
    const stats = makeStats(['./packages/app/src/Button.jsx']);

    expect(getPackageFilesInBuild(ctx, stats, ['./package.json'])).toEqual(['./package.json']);
    expect(getPackageFilesInBuild(ctx, stats, ['package.json'])).toEqual(['package.json']);
  });

  it('keeps package files whose directory contains a module in the build', () => {
    const ctx = makeContext('/repo');
    const stats = makeStats([
      '/repo/packages/app/src/Button.jsx',
      '/repo/packages/app/src/index.js',
    ]);

    expect(getPackageFilesInBuild(ctx, stats, ['packages/app/package.json'])).toEqual([
      'packages/app/package.json',
    ]);
  });

  it('drops package files whose directory has no module in the build', () => {
    const ctx = makeContext('/repo');
    const stats = makeStats(['/repo/packages/app/src/Button.jsx']);

    expect(getPackageFilesInBuild(ctx, stats, ['packages/unrelated/package.json'])).toEqual([]);
  });

  it('does not treat a directory as relevant via a partial name match', () => {
    const ctx = makeContext('/repo');
    // `packages/app-utils` should not be matched by the `packages/app` package file.
    const stats = makeStats(['/repo/packages/app-utils/src/index.js']);

    expect(getPackageFilesInBuild(ctx, stats, ['packages/app/package.json'])).toEqual([]);
  });

  it('matches modules relative to the Storybook base directory', () => {
    const ctx = makeContext('/repo', 'packages/app');
    // Builder stats generated inside `packages/app` reference modules relative to that directory.
    const stats = makeStats(['./src/Button.jsx']);

    expect(getPackageFilesInBuild(ctx, stats, ['packages/app/package.json'])).toEqual([
      'packages/app/package.json',
    ]);
  });

  it('considers the constituent modules of concatenated modules', () => {
    const ctx = makeContext('/repo');
    const stats: Stats = {
      modules: [
        {
          id: 0,
          name: '/repo/packages/app/src/index.js + 2 modules',
          modules: [{ name: '/repo/packages/app/src/Button.jsx' }],
        },
      ],
    };

    expect(getPackageFilesInBuild(ctx, stats, ['packages/app/package.json'])).toEqual([
      'packages/app/package.json',
    ]);
  });

  it('filters a mixed list of relevant and irrelevant package files', () => {
    const ctx = makeContext('/repo');
    const stats = makeStats(['/repo/packages/app/src/Button.jsx']);

    expect(
      getPackageFilesInBuild(ctx, stats, [
        './package.json',
        'packages/app/package.json',
        'packages/unrelated/package.json',
      ])
    ).toEqual(['./package.json', 'packages/app/package.json']);
  });
});
