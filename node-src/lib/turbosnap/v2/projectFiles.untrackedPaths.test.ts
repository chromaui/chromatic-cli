import { execFileSync } from 'child_process';
import { mkdirSync, symlinkSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { repository, temporaryDirectory, track, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

async function untrackedAmong(absolutePaths: string[]): Promise<string[]> {
  const untracked = await realProjectFiles({ log: new TestLogger() }).untrackedPaths();
  return absolutePaths.filter((absolutePath) => untracked.has(absolutePath));
}

describe('realProjectFiles untrackedPaths', () => {
  // The adapter asks the repository the CLI runs in, so each test runs in its own.
  const originalDirectory = process.cwd();

  afterEach(() => {
    process.chdir(originalDirectory);
  });

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

  it('reports an untracked file git ignores, by directory or by file pattern', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'generated/schema.ts');
    const log = write(root, 'debug.log');

    expect(await untrackedAmong([schema, log])).toEqual([schema, log]);
  });

  it('reports an untracked file no pattern matches, alone or in a wholly untracked directory', async () => {
    const root = ignoringRepository();
    track(root, 'src/Button.tsx');
    const buildInfo = write(root, 'src/build-info.json');
    const stamp = write(root, 'src/stamps/version.json');

    expect(await untrackedAmong([buildInfo, stamp])).toEqual([buildInfo, stamp]);
  });

  it('never reports a tracked file, even one a pattern matches or one with uncommitted edits', async () => {
    const root = ignoringRepository();
    const tracked = track(root, 'tracked.log');
    const button = track(root, 'src/Button.tsx');
    write(root, 'src/Button.tsx', 'edited');

    expect(await untrackedAmong([tracked, button])).toEqual([]);
  });

  it('reports a file anywhere in the repository when run from a package directory, as a monorepo CLI is', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'generated/schema.ts');
    const buildInfo = write(root, 'build-info.json');
    track(root, 'packages/ui/package.json');
    process.chdir(path.join(root, 'packages/ui'));

    expect(await untrackedAmong([schema, buildInfo])).toEqual([schema, buildInfo]);
  });

  it('never reports a path outside the repository', async () => {
    ignoringRepository();
    const elsewhere = write(temporaryDirectory(), 'generated/schema.ts');

    expect(await untrackedAmong([elsewhere])).toEqual([]);
  });

  it('never reports a file inside a submodule, which the superproject does not list', async () => {
    const library = repository();
    track(library, 'index.ts');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init'], {
      cwd: library,
    });
    const root = ignoringRepository();
    execFileSync(
      'git',
      ['-c', 'protocol.file.allow=always', 'submodule', 'add', '--quiet', library, 'vendor/lib'],
      { cwd: root }
    );
    const tracked = path.join(root, 'vendor/lib/index.ts');
    const untracked = write(root, 'vendor/lib/build-info.json');

    expect(await untrackedAmong([tracked, untracked])).toEqual([]);
  });

  it('matches a path as git names it, so one through a symlinked directory is not reported until resolved', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'packages/ui/generated/schema.ts');
    mkdirSync(path.join(root, 'apps'));
    symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'apps/storybook'));
    // Tracked, so the link's own directory is not untracked and covering the path.
    execFileSync('git', ['add', 'apps/storybook'], { cwd: root });
    const linked = path.join(root, 'apps/storybook/generated/schema.ts');
    const projectFiles = realProjectFiles({ log: new TestLogger() });
    const untracked = await projectFiles.untrackedPaths();

    expect(untracked.has(linked)).toBe(false);
    expect(untracked.has(projectFiles.realPath(linked))).toBe(true);
    expect(projectFiles.realPath(linked)).toBe(schema);
  });

  it('rejects when git cannot answer, rather than guessing that everything is tracked', async () => {
    const root = temporaryDirectory();
    process.chdir(root);
    const schema = write(root, 'generated/schema.ts');

    await expect(untrackedAmong([schema])).rejects.toThrow(/Git repository/);
  });
});
