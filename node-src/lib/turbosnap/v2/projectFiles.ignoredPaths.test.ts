import { mkdirSync, symlinkSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { repository, temporaryDirectory, track, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

async function ignoredAmong(absolutePaths: string[]): Promise<string[]> {
  const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredPaths();
  return absolutePaths.filter((absolutePath) => ignored.has(absolutePath));
}

/**
 * Creates a repository ignoring `generated/` and `*.log`, and enters it.
 *
 * @returns The absolute path of the repository.
 */
function ignoringRepository(): string {
  const root = repository();
  write(root, '.gitignore', 'generated/\n*.log\n');
  process.chdir(root);
  return root;
}

describe('realProjectFiles ignoredPaths', () => {
  // The adapter asks the repository the CLI runs in, so each test runs in its own.
  const originalDirectory = process.cwd();

  afterEach(() => {
    process.chdir(originalDirectory);
  });

  it('reports an untracked file git ignores, by directory or by file pattern', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'generated/schema.ts');
    const log = write(root, 'debug.log');
    const button = write(root, 'src/Button.tsx');

    expect(await ignoredAmong([schema, log, button])).toEqual([schema, log]);
  });

  it('never reports a tracked file, even one a pattern matches', async () => {
    const root = ignoringRepository();
    const tracked = track(root, 'tracked.log');

    expect(await ignoredAmong([tracked])).toEqual([]);
  });

  it('reports a file anywhere in the repository when run from a package directory, as a monorepo CLI is', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'generated/schema.ts');
    const log = write(root, 'packages/ui/debug.log');
    process.chdir(path.join(root, 'packages/ui'));

    expect(await ignoredAmong([schema, log])).toEqual([schema, log]);
  });

  it('never reports a path outside the repository', async () => {
    ignoringRepository();
    const elsewhere = write(temporaryDirectory(), 'generated/schema.ts');

    expect(await ignoredAmong([elsewhere])).toEqual([]);
  });

  it('matches a path as git names it, so one through a symlinked directory is not reported until resolved', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'packages/ui/generated/schema.ts');
    mkdirSync(path.join(root, 'apps'));
    symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'apps/storybook'));
    const linked = path.join(root, 'apps/storybook/generated/schema.ts');
    const projectFiles = realProjectFiles({ log: new TestLogger() });
    const ignored = await projectFiles.ignoredPaths();

    expect(ignored.has(linked)).toBe(false);
    expect(ignored.has(projectFiles.realPath(linked))).toBe(true);
    expect(projectFiles.realPath(linked)).toBe(schema);
  });

  it('rejects when git cannot answer, rather than guessing that nothing is ignored', async () => {
    const root = temporaryDirectory();
    process.chdir(root);
    const schema = write(root, 'generated/schema.ts');

    await expect(ignoredAmong([schema])).rejects.toThrow(/Git repository/);
  });
});
