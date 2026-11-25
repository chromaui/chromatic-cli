import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from './init';

vi.mock('@clack/prompts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clack/prompts')>();
  return { ...original, log: { ...original.log, error: vi.fn() } };
});

let root: string;
const previous = process.cwd();

function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

function commit() {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=x', 'commit', '-qm', 'init'], {
    cwd: root,
  });
}

const changedFiles = () =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'init-test-'));
  write('package.json', JSON.stringify({ name: 'root', private: true }));
  write('packages/app/package.json', JSON.stringify({ name: 'app' }));
  vi.stubEnv('CI', '1');
  vi.stubEnv('CHROMATIC_PROJECT_TOKEN', 'chpt_test');
});

afterEach(() => {
  process.chdir(previous);
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('init stops before writing anything', () => {
  it('when the project folder has no package.json', async () => {
    write('packages/app/tests/vitest.config.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app/tests'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No package.json in packages/app/tests' });
    expect(changedFiles()).toBe('');
  });

  it('when the framework it sets up has no config here or above', async () => {
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'playwright'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No Playwright config' });
    expect(changedFiles()).toBe('');
  });

  it('when --framework storybook names a package whose Storybook builds from the root', async () => {
    write('.storybook/main.ts', 'export default {}\n');
    write('vitest.config.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'storybook'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'Nothing to set up in packages/app' });
    expect(changedFiles()).toBe('');
    // Points at the Storybook, not at the Vitest config next to it.
    expect(clack.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Storybook builds from the repository root (.storybook)')
    );
  });
});
