import { mkdirSync, symlinkSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import TestLogger from '../../testLogger';
import { repository, temporaryDirectory, track, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

describe('realProjectFiles ignoredFiles', () => {
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
    const button = write(root, 'src/Button.tsx');

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([
      schema,
      log,
      button,
    ]);

    expect([...ignored].sort()).toEqual([log, schema].sort());
  });

  it('never reports a tracked file, even one a pattern matches', async () => {
    const root = ignoringRepository();
    const tracked = track(root, 'tracked.log');

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([tracked]);

    expect([...ignored]).toEqual([]);
  });

  it('reports a file anywhere in the repository when run from a package directory, as a monorepo CLI is', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'generated/schema.ts');
    const log = write(root, 'packages/ui/debug.log');
    process.chdir(path.join(root, 'packages/ui'));

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([schema, log]);

    expect([...ignored].sort()).toEqual([log, schema].sort());
  });

  it('never reports a path outside the repository', async () => {
    ignoringRepository();
    const elsewhere = write(temporaryDirectory(), 'generated/schema.ts');

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([elsewhere]);

    expect([...ignored]).toEqual([]);
  });

  it('matches a path as git names it, so one through a symlinked directory is not reported until resolved', async () => {
    const root = ignoringRepository();
    const schema = write(root, 'packages/ui/generated/schema.ts');
    mkdirSync(path.join(root, 'apps'));
    symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'apps/storybook'));
    const linked = path.join(root, 'apps/storybook/generated/schema.ts');
    const projectFiles = realProjectFiles({ log: new TestLogger() });

    expect([...(await projectFiles.ignoredFiles([linked]))]).toEqual([]);
    expect([...(await projectFiles.ignoredFiles([projectFiles.realPath(linked)]))]).toEqual([
      schema,
    ]);
  });

  it('rejects when git cannot answer, rather than guessing that nothing is ignored', async () => {
    const root = temporaryDirectory();
    process.chdir(root);
    const schema = write(root, 'generated/schema.ts');

    await expect(
      realProjectFiles({ log: new TestLogger() }).ignoredFiles([schema])
    ).rejects.toThrow(/Git repository/);
  });
});
