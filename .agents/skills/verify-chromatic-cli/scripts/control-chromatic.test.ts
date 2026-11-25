import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

function helperRun(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync('bash', [helper, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_ROOT: join(root, 'runs'),
      RUN_ID: 'test',
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      ...env,
    },
  });
}

function buildRef(ref = 'HEAD') {
  return helperRun(['build-ref', 'baseline', ref]);
}

// Stands in for a built CLI: posts one event to its DSN unless Sentry is turned off, as Sentry.init does.
const sentryBundle = `
const dsn = new URL('https://0123abcd@o1.ingest.us.sentry.io/42');
if (process.env.DISABLE_ERROR_MONITORING === 'true') process.exit(7);
// Never reach the real host, even when the helper regresses.
if (dsn.hostname !== '127.0.0.1') process.exit(5);
const envelope = ['{}', '{"type":"event"}', '{"exception":{"values":[{"type":"Error","value":"boom"}]}}'];
fetch(\`\${dsn.protocol}//\${dsn.host}/api\${dsn.pathname}/envelope/\`, { method: 'POST', body: envelope.join('\\n') })
  .then(() => process.exit(3));
`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-ref-'));
  const scripts = join(root, '.agents/skills/verify-chromatic-cli/scripts');
  mkdirSync(scripts, { recursive: true });
  helper = join(scripts, 'control-chromatic');
  copyFileSync(new URL('./control-chromatic', import.meta.url), helper);
  copyFileSync(new URL('./sentry-sink.mjs', import.meta.url), join(scripts, 'sentry-sink.mjs'));
  writeFileSync(join(root, 'package.json'), '{"private":true,"version":"1.0.0"}\n');
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
  writeFileSync(
    join(root, 'bin/yarn'),
    '#!/bin/sh\nmkdir -p dist\nif [ -f bundle.cjs ]; then cp bundle.cjs dist/bin.cjs; else echo bundle > dist/bin.cjs; fi\n',
    { mode: 0o755 }
  );
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

it.each([
  { private: true, version: '1.0.1' },
  { private: true, version: '1.0.0', dependencies: { example: '2.0.0' } },
])('compares the requested ref, not HEAD (%j)', (manifest) => {
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest)}\n`);
  git('add', 'package.json');
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
    'Change manifest'
  );
  expect(git('status', '--porcelain', '--untracked-files=no')).toBe('');
  const result = buildRef('HEAD~1');
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(existsSync(join(root, 'runs/test/work/cli-baseline'))).toBe(false);
});

it('prints only a usable bundle path when manifests match', () => {
  const result = buildRef();
  expect(result.status, result.stderr).toBe(0);
  const bundle = join(root, 'runs/test/work/cli-baseline/dist/bin.cjs');
  expect(result.stdout).toBe(`${bundle}\n`);
  expect(existsSync(bundle)).toBe(true);
});

it('points a --sentry build of the working tree at the sink and records its events', () => {
  writeFileSync(join(root, 'bundle.cjs'), sentryBundle);
  const build = helperRun(['build-ref', 'sentry', 'WORKTREE', '--sentry']);
  expect(build.status, build.stderr).toBe(0);
  const bundle = build.stdout.trim();
  expect(readFileSync(bundle, 'utf8')).not.toContain('sentry.io');

  // The shell may turn Sentry off; a Sentry build must still report to the sink.
  const drive = helperRun(['run', 'sentry-drive', '--cli', bundle], {
    DISABLE_ERROR_MONITORING: 'true',
  });
  expect(drive.status, drive.stderr).toBe(0);
  expect(readFileSync(join(root, 'runs/test/evidence/sentry-drive/exit_code'), 'utf8')).toBe('3\n');
  const items = readFileSync(join(root, 'runs/test/evidence/sentry-drive/sentry.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(items).toEqual([
    expect.objectContaining({
      type: 'event',
      payload: { exception: { values: [{ type: 'Error', value: 'boom' }] } },
    }),
  ]);
  expect(drive.stdout).toContain('-- sentry: 1 events');
});

it('turns Sentry off for bundles that still have the real DSN', () => {
  writeFileSync(join(root, 'bundle.cjs'), sentryBundle);
  const build = helperRun(['build-ref', 'plain', 'WORKTREE']);
  expect(build.status, build.stderr).toBe(0);
  const drive = helperRun(['run', 'plain-drive', '--cli', build.stdout.trim()], {
    DISABLE_ERROR_MONITORING: undefined,
  });
  expect(drive.status, drive.stderr).toBe(0);
  expect(readFileSync(join(root, 'runs/test/evidence/plain-drive/exit_code'), 'utf8')).toBe('7\n');
  expect(existsSync(join(root, 'runs/test/evidence/plain-drive/sentry.jsonl'))).toBe(false);
});

it('refuses a --sentry build that still names the ingest host after the rewrite', () => {
  // The rewrite only matches a DSN with a key, so this ingest URL survives it.
  writeFileSync(
    join(root, 'bundle.cjs'),
    `${sentryBundle}\nconst other = 'https://o1.ingest.us.sentry.io/42';\n`
  );
  const build = helperRun(['build-ref', 'leaky', 'WORKTREE', '--sentry']);
  expect(build.status).toBe(2);
  expect(build.stdout).toBe('');
  expect(build.stderr).toContain('refusing to use this build');
});
