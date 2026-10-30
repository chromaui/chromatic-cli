import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../testLogger';
import { repository, temporaryDirectory, track, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

async function untrackedAmong(absolutePaths: string[]): Promise<string[]> {
  const untracked = await realProjectFiles({ log: new TestLogger() }).untrackedPaths(absolutePaths);
  return absolutePaths.filter((absolutePath) => untracked.has(absolutePath));
}

describe('realProjectFiles untrackedPaths', () => {
  // The adapter asks the repository the CLI runs in, so each test runs in its own.
  const originalDirectory = process.cwd();

  afterEach(() => {
    process.chdir(originalDirectory);
    vi.unstubAllEnvs();
  });

  /**
   * Creates a repository ignoring `generated/` and `*.log`, and enters it.
   *
   * @returns The absolute path of the repository.
   */
  function ignoringRepository(): string {
    const root = repository();
    // Tracked, so the repository has an index entry, as any real checkout does.
    track(root, '.gitignore');
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
    const untracked = await projectFiles.untrackedPaths([linked, projectFiles.realPath(linked)]);

    expect(untracked.has(linked)).toBe(false);
    expect(untracked.has(projectFiles.realPath(linked))).toBe(true);
    expect(projectFiles.realPath(linked)).toBe(schema);
  });

  it('matches the whole-repository answer below opaque or replaced top-level entries', async () => {
    const root = ignoringRepository();
    const nested = write(root, 'nested/sub/file');
    execFileSync('git', ['init', '-q'], { cwd: path.join(root, 'nested') });
    // Although the working tree now holds a directory, the index still has a single tracked file.
    const replaced = track(root, 'replaced');
    rmSync(replaced);
    const underReplaced = write(root, 'replaced/sub/file');
    const adapter = realProjectFiles({ log: new TestLogger() });

    const broad = await adapter.untrackedPaths();
    const scoped = await adapter.untrackedPaths([nested, underReplaced]);

    expect([nested, underReplaced].map((p) => broad.has(p))).toEqual([true, false]);
    expect([nested, underReplaced].map((p) => scoped.has(p))).toEqual([true, false]);
  });

  it('treats candidate pathspecs literally and rejects lookups outside the scan', async () => {
    const root = ignoringRepository();
    // An indexed child establishes the directory even after it is deleted from the working tree.
    rmSync(track(root, 'packages/anchor'));
    const asset = write(root, 'packages/a [b] $(echo test)/new.log');
    const sibling = write(root, 'packages/another/new.log');
    const adapter = realProjectFiles({ log: new TestLogger() });
    const scoped = await adapter.untrackedPaths([asset]);

    expect(scoped.has(asset)).toBe(true);
    expect(() => scoped.has(sibling)).toThrow(/outside the requested paths/);
  });

  it('matches the whole-repository answer after a case-only directory rename', async ({ skip }) => {
    const root = ignoringRepository();
    track(root, 'Packages/anchor');
    renameSync(path.join(root, 'Packages'), path.join(root, 'temporary'));
    renameSync(path.join(root, 'temporary'), path.join(root, 'packages'));
    write(root, 'packages/ui/build-info.json');
    const alias = path.join(root, 'Packages/ui/build-info.json');
    skip(!existsSync(alias), 'requires a case-insensitive filesystem');

    const adapter = realProjectFiles({ log: new TestLogger() });
    const candidate = adapter.realPath(alias);
    const broad = await adapter.untrackedPaths();
    const scoped = await adapter.untrackedPaths([candidate]);

    expect(scoped.has(candidate)).toBe(broad.has(candidate));
  });

  it('retains the full Git listing when the caller configures pathspec matching', async () => {
    const root = ignoringRepository();
    vi.stubEnv('GIT_GLOB_PATHSPECS', '1');
    const first = write(root, 'first/file');
    const other = write(root, 'other/file');
    const listing = await realProjectFiles({ log: new TestLogger() }).untrackedPaths([first]);

    expect(listing.has(first)).toBe(true);
    expect(listing.has(other)).toBe(true);
  });

  it.skipIf(process.platform === 'win32')(
    'preserves a literal pathspec relative to the CLI directory',
    async () => {
      const root = ignoringRepository();
      const atRoot = write(root, ':/root.txt');
      const atPackage = write(root, 'package/:/asset.txt');
      process.chdir(path.join(root, 'package'));
      // In literal mode, Git reads the original :/ selector as a directory named ":".
      vi.stubEnv('GIT_LITERAL_PATHSPECS', '1');

      expect(await untrackedAmong([atRoot, atPackage])).toEqual([atPackage]);
    }
  );

  it('rejects when git cannot answer, rather than guessing that everything is tracked', async () => {
    const root = temporaryDirectory();
    process.chdir(root);
    const schema = write(root, 'generated/schema.ts');

    await expect(untrackedAmong([schema])).rejects.toThrow(/Git repository/);
  });

  it('rejects when the index is missing, rather than reporting the whole repository as untracked', async () => {
    const root = ignoringRepository();
    const button = track(root, 'src/Button.tsx');
    rmSync(path.join(root, '.git/index'));

    await expect(untrackedAmong([button])).rejects.toThrow(/no tracked files/);
  });
});
