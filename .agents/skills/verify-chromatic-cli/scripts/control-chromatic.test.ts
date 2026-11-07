import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let root: string;
let helper: string;

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function buildRef() {
  return spawnSync('bash', [helper, 'build-ref', 'baseline', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_ROOT: join(root, 'runs'),
      RUN_ID: 'test',
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-ref-'));
  const scripts = join(root, '.agents/skills/verify-chromatic-cli/scripts');
  mkdirSync(scripts, { recursive: true });
  helper = join(scripts, 'control-chromatic');
  copyFileSync(new URL('./control-chromatic', import.meta.url), helper);
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');
  writeFileSync(join(root, 'yarn.lock'), '# baseline\n');
  git('init', '-q');
  git('add', 'package.json', 'yarn.lock');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'Baseline'
  );
  mkdirSync(join(root, 'node_modules'));
  mkdirSync(join(root, 'bin'));
  // The build boundary is a stub; git comparisons and worktrees are real.
  writeFileSync(join(root, 'bin/yarn'), '#!/bin/sh\nmkdir -p dist\necho bundle > dist/bin.cjs\n', {
    mode: 0o755,
  });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

it.each([
  ['package.json', 'staged'],
  ['yarn.lock', 'unstaged'],
  ['package.json', 'assume-unchanged'],
  ['yarn.lock', 'assume-unchanged'],
  ['package.json', 'skip-worktree'],
  ['yarn.lock', 'skip-worktree'],
])('refuses changed %s (%s) without producing a bundle', (file, mode) => {
  if (mode === 'assume-unchanged' || mode === 'skip-worktree') {
    git('update-index', `--${mode}`, file);
  }
  writeFileSync(join(root, file), file === 'package.json' ? '{"private":false}\n' : '# changed\n');
  if (mode === 'staged') git('add', file);
  const result = buildRef();
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('install-published');
  expect(existsSync(join(root, 'runs/test/work/cli-baseline'))).toBe(false);
  expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
});

it('prints only a usable bundle path when manifests match', () => {
  const result = buildRef();
  expect(result.status, result.stderr).toBe(0);
  const bundle = join(root, 'runs/test/work/cli-baseline/dist/bin.cjs');
  expect(result.stdout).toBe(`${bundle}\n`);
  expect(existsSync(bundle)).toBe(true);
});
