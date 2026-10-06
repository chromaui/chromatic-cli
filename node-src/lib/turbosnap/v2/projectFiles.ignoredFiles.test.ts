import { execFileSync } from 'child_process';
import { mkdirSync, realpathSync, symlinkSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../testLogger';
import { temporaryDirectory, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

describe('realProjectFiles ignoredFiles', () => {
  // The adapter asks the repository the CLI runs in, so each test runs in its own. Git also reads
  // the machine's global and system config, whose excludes file could flip a result, so both are
  // pointed at nothing for the duration. And when the suite runs inside a git hook, the hook's
  // repository-location variables would point every git command at that repository instead of the
  // temporary one, so they are cleared too.
  const originalDirectory = process.cwd();

  beforeEach(() => {
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
    vi.stubEnv('GIT_DIR', undefined);
    vi.stubEnv('GIT_WORK_TREE', undefined);
    vi.stubEnv('GIT_INDEX_FILE', undefined);
  });

  afterEach(() => {
    process.chdir(originalDirectory);
    vi.unstubAllEnvs();
  });

  /**
   * Creates a repository ignoring `generated/` and `*.log`, and enters it. The root is the real path,
   * not the link path the OS hands out (on macOS the temp dir is itself a symlink), since the
   * adapter matches paths exactly as git names them.
   *
   * @returns The absolute path of the repository.
   */
  function repository(): string {
    const root = realpathSync(temporaryDirectory());
    execFileSync('git', ['init', '-q'], { cwd: root });
    write(root, '.gitignore', 'generated/\n*.log\n');
    process.chdir(root);
    return root;
  }

  it('reports an untracked file git ignores, by directory or by file pattern', async () => {
    const root = repository();
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
    const root = repository();
    const tracked = write(root, 'tracked.log');
    execFileSync('git', ['add', '--force', 'tracked.log'], { cwd: root });

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([tracked]);

    expect([...ignored]).toEqual([]);
  });

  it('reports a file anywhere in the repository when run from a package directory, as a monorepo CLI is', async () => {
    const root = repository();
    const schema = write(root, 'generated/schema.ts');
    const log = write(root, 'packages/ui/debug.log');
    process.chdir(path.join(root, 'packages/ui'));

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([schema, log]);

    expect([...ignored].sort()).toEqual([log, schema].sort());
  });

  it('never reports a path outside the repository', async () => {
    repository();
    const elsewhere = write(temporaryDirectory(), 'generated/schema.ts');

    const ignored = await realProjectFiles({ log: new TestLogger() }).ignoredFiles([elsewhere]);

    expect([...ignored]).toEqual([]);
  });

  it('matches a path as git names it, so one through a symlinked directory is not reported until resolved', async () => {
    const root = repository();
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
