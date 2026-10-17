import { describe, expect, it } from 'vitest';

import { InMemoryDisk, inMemoryProjectFiles } from '../projectFiles/projectFiles.fake';
import { buildSkipRule, SkipContext } from './skippedFiles';

const projectRoot = '/repo/packages/ui';
const configDirectory = `${projectRoot}/.storybook`;
const generated = `${projectRoot}/src/generated/schema.ts`;
const source = `${projectRoot}/src/Button.tsx`;
const installed = `${projectRoot}/node_modules/react/index.js`;
const preview = `${configDirectory}/preview.ts`;

function context(disk: InMemoryDisk, untraced: string[] = []): SkipContext {
  return {
    gitRoot: '/repo',
    untraced,
    projectFiles: inMemoryProjectFiles(disk),
  };
}

async function skipped(absolutePaths: string[], skipContext: SkipContext) {
  const skipRule = await buildSkipRule(skipContext);
  return absolutePaths.flatMap((absolutePath) => {
    const reason = skipRule(absolutePath);
    return reason ? [[absolutePath, reason]] : [];
  });
}

describe('buildSkipRule', () => {
  it('skips the files git ignores, recording why', async () => {
    const result = await skipped(
      [generated, source],
      context({ isIgnored: (candidate) => candidate === generated })
    );

    expect(result).toEqual([[generated, 'gitignored']]);
  });

  it('never skips a node_modules file, however git sees it', async () => {
    const result = await skipped([installed, source], context({ isIgnored: () => true }));

    expect(result).toEqual([[source, 'gitignored']]);
  });

  it('skips a gitignored file in the Storybook config directory like any other project file', async () => {
    const result = await skipped(
      [preview, source],
      context({ isIgnored: (candidate) => candidate === preview })
    );

    expect(result).toEqual([[preview, 'gitignored']]);
  });

  it("skips a sibling package's gitignored file, since the rule is git's view of the whole repository", async () => {
    const built = '/repo/packages/icons/dist/index.js';

    const result = await skipped([built, generated], context({ isIgnored: () => true }));

    expect(result).toEqual([
      [built, 'gitignored'],
      [generated, 'gitignored'],
    ]);
  });

  it('skips a sibling file reached through a node_modules symlink spelling, since the rule judges the real path git names', async () => {
    const real = '/repo/packages/theme/src/generated.ts';
    const linked = '/repo/packages/ui/node_modules/theme/src/generated.ts';
    const projectFiles = {
      ...inMemoryProjectFiles({ isIgnored: (candidate) => candidate === real }),
      realPath: (absolutePath: string) => absolutePath.replace(linked, real),
    };

    const result = await skipped([linked, installed], { ...context({}), projectFiles });

    expect(result).toEqual([[linked, 'gitignored']]);
  });

  it('judges every rule by where a file really lives, since a bundler may name a file through a symlink', async () => {
    const linkedRoot = '/repo/apps/web';
    const projectFiles = {
      ...inMemoryProjectFiles({
        isIgnored: (candidate) => candidate === generated,
      }),
      realPath: (absolutePath: string) => absolutePath.replace(linkedRoot, projectRoot),
    };
    const linkedGenerated = generated.replace(projectRoot, linkedRoot);

    const result = await skipped([linkedGenerated, source], {
      ...context({}),
      projectFiles,
    });

    expect(result).toEqual([[linkedGenerated, 'gitignored']]);
  });

  it('asks git by real path and answers by the path it was given', async () => {
    const asked: string[] = [];
    const projectFiles = {
      ...inMemoryProjectFiles({}),
      realPath: (absolutePath: string) => absolutePath.replace('/repo/apps/web', projectRoot),
      ignoredPaths: async () => ({
        has: (absolutePath: string) => {
          asked.push(absolutePath);
          return true;
        },
      }),
    };
    const linked = generated.replace(projectRoot, '/repo/apps/web');

    const result = await skipped([linked], { ...context({}), projectFiles });

    expect(asked).toEqual([generated]);
    expect(result).toEqual([[linked, 'gitignored']]);
  });

  it('asks git once, however many files are judged', async () => {
    let listings = 0;
    const projectFiles = {
      ...inMemoryProjectFiles({}),
      ignoredPaths: async () => {
        listings += 1;
        return { has: () => false };
      },
    };

    await skipped([generated, source, installed], { ...context({}), projectFiles });

    expect(listings).toBe(1);
  });

  it('skips the files an --untraced glob matches, by their repository-root-relative path as v1 matches them', async () => {
    const result = await skipped(
      [generated, source],
      context({}, ['packages/ui/src/generated/**'])
    );

    expect(result).toEqual([[generated, 'untraced']]);
  });

  it('skips an untraced node_modules file, since the user asked', async () => {
    const result = await skipped([installed, source], context({}, ['**/node_modules/react/**']));

    expect(result).toEqual([[installed, 'untraced']]);
  });

  it('skips an untraced file of another package, since the user asked', async () => {
    const built = '/repo/packages/icons/dist/index.js';

    const result = await skipped([built, source], context({}, ['packages/icons/**']));

    expect(result).toEqual([[built, 'untraced']]);
  });

  it('skips an untraced file in the Storybook config directory, since the documented recipe untraces the global decorators there', async () => {
    const decorator = `${configDirectory}/decorators/withTheme.ts`;

    const result = await skipped(
      [decorator, preview, source],
      context({}, ['**/.storybook/decorators/*.ts'])
    );

    expect(result).toEqual([[decorator, 'untraced']]);
  });

  it("records a file both untraced and ignored as untraced, since that is the user's own say", async () => {
    const result = await skipped(
      [generated],
      context({ isIgnored: (absolutePath) => absolutePath === generated }, [
        'packages/ui/src/generated/**',
      ])
    );

    expect(result).toEqual([[generated, 'untraced']]);
  });

  it('matches an --untraced glob against the real path, as v1 does, so a glob written for the tracked path skips a file reached through a symlink', async () => {
    const linkedGenerated = generated.replace(projectRoot, '/repo/apps/web');
    const projectFiles = {
      ...inMemoryProjectFiles({}),
      realPath: (absolutePath: string) => absolutePath.replace('/repo/apps/web', projectRoot),
    };

    const result = await skipped([linkedGenerated], {
      ...context({}, ['packages/ui/src/generated/**']),
      projectFiles,
    });

    expect(result).toEqual([[linkedGenerated, 'untraced']]);
  });

  it('does not match an --untraced glob written for the symlink spelling, which v1 never sees', async () => {
    const linkedGenerated = generated.replace(projectRoot, '/repo/apps/web');
    const projectFiles = {
      ...inMemoryProjectFiles({}),
      realPath: (absolutePath: string) => absolutePath.replace('/repo/apps/web', projectRoot),
    };

    const result = await skipped([linkedGenerated], {
      ...context({}, ['apps/web/src/generated/**']),
      projectFiles,
    });

    expect(result).toEqual([]);
  });
});
