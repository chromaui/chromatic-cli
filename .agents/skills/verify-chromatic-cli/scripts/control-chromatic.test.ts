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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let helper: string;

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function control(args: string[], env: Record<string, string | undefined> = {}) {
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
  return control(['build-ref', 'baseline', ref]);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-ref-'));
  const scripts = join(root, '.agents/skills/verify-chromatic-cli/scripts');
  mkdirSync(scripts, { recursive: true });
  helper = join(scripts, 'control-chromatic');
  copyFileSync(new URL('./control-chromatic', import.meta.url), helper);
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
  // The build and fixture installs are stubs; git comparisons, worktrees, and fixture repos are real.
  writeFileSync(
    join(root, 'bin/yarn'),
    `#!/bin/sh
if [ "$1" = fixture ]; then
  case "$2" in broken) echo "install failed" >&2; exit 1 ;; esac
  cp -R "e2e/fixtures/$2" "$3" && cd "$3" && git init -q && git add -A &&
    git -c user.name=Fixture -c user.email=f@example.invalid -c commit.gpgsign=false commit -qm Initial
  exit
fi
mkdir -p dist
if [ -n "$FAKE_CLI" ]; then cp "$FAKE_CLI" dist/bin.cjs; else echo bundle > dist/bin.cjs; fi
`,
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

describe('matrix', () => {
  const token = 'chpt_secretvalue1234';
  const matrix = (args: string[], env: Record<string, string> = {}) =>
    control(['matrix', ...args], {
      CHROMATIC_PROJECT_TOKEN: token,
      FAKE_CLI: join(root, 'fake-cli.cjs'),
      ...env,
    });
  const fixtures = {
    'react-vite': '@storybook/react-vite',
    'react-webpack5': '@storybook/react-webpack5',
    'react-rsbuild': 'storybook-react-rsbuild',
  };

  function addFixture(name: string, builder: string, dir = '') {
    const path = join(root, 'e2e/fixtures', name, dir);
    mkdirSync(join(path, 'src'), { recursive: true });
    writeFileSync(join(path, 'src/Button.tsx'), 'New\n');
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ devDependencies: { [builder]: '1' } })
    );
  }

  beforeEach(() => {
    for (const [name, builder] of Object.entries(fixtures)) addFixture(name, builder);
    addFixture('monorepo-pnpm', '@storybook/react-vite', 'packages/ui');
    // A root-level fixture that isn't a builder fixture, like the Vitest one.
    addFixture('react-vitest', 'vitest');
    writeFileSync(
      join(root, 'e2e/fixtures/monorepo-pnpm/package.json'),
      '{"packageManager":"pnpm@12.6.0"}'
    );
    // A CLI that breaks only on webpack, the case a Vite-only run misses. The base CLI that
    // --compare builds into cli-matrix-base works everywhere.
    mkdirSync(join(root, 'dist'));
    writeFileSync(
      join(root, 'fake-cli.cjs'),
      `const fs = require('fs');
const args = process.argv;
const deps = JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies;
const webpack = '@storybook/react-webpack5' in deps && !__dirname.includes('cli-matrix-base');
const number = 100 + Object.keys(deps)[0].length;
if ('crash' in deps) process.exit(255);
if (args.includes('--skip')) {
  const diagnostics = { exitCodeKey: 'OK', skip: true, options: { argv: args.slice(2) } };
  fs.writeFileSync(args[args.indexOf('--diagnostics-file') + 1], JSON.stringify(diagnostics));
  process.exit(0);
}
const turboSnap = args.includes('--only-changed') ? {} : undefined;
const v2 = turboSnap && process.env.FAKE_V2 && process.env.CHROMATIC_TURBOSNAP_DISABLE_V1;
// A failed build keeps the ancestor in .build; a TurboSnap skip reports the ancestor deliberately.
const failed = 'failing' in deps;
const skip = 'skipping' in deps;
fs.writeFileSync(args[args.indexOf('--diagnostics-file') + 1], JSON.stringify({
  exitCodeKey: webpack ? 'BUILD_FAILED' : failed ? 'NPM_BUILD_STORYBOOK_FAILED' : 'OK',
  announcedBuild: { app: { id: 'app123' }, number, status: failed || skip ? 'ANNOUNCED' : 'PUBLISHED' },
  build: { number: failed || skip ? 42 : number, actualCaptureCount: 2 },
  skip,
  turboSnap,
  hashBasedTurboSnap: v2 ? { bailed: false } : undefined,
  options: { argv: args.slice(2) },
}));
process.exit(webpack ? 2 : failed ? 105 : 0);
`
    );
    copyFileSync(join(root, 'fake-cli.cjs'), join(root, 'dist/bin.cjs'));
  });

  it.each([
    ['--dry-run'],
    ['--dry-run=true'],
    ['-t', token],
    [`-t${token}`],
    [`--project-token=${token}`],
    ['--diagnostics-file', 'd.json'],
  ])('refuses %s before publishing anything', (...args) => {
    const result = control(['matrix', '--', ...args], { CHROMATIC_PROJECT_TOKEN: token });
    expect(result.status).toBe(2);
    expect(result.stderr).not.toContain(token);
    expect(existsSync(join(root, 'runs/test/evidence/matrix'))).toBe(false);
  });

  it('refuses to run without CHROMATIC_PROJECT_TOKEN', () => {
    const result = matrix([], { CHROMATIC_PROJECT_TOKEN: '' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('CHROMATIC_PROJECT_TOKEN');
  });

  it('publishes in every builder fixture and reports each one without the token', () => {
    const result = matrix(['--', '--exit-zero-on-changes']);
    expect(result.status, result.stderr).toBe(0);
    const block = result.stdout;
    expect(block).toBe(readFileSync(join(root, 'runs/test/evidence/matrix.md'), 'utf8'));
    expect(block).not.toContain(token);
    expect(block).toContain('Chromatic project: `app123`');
    expect(block).toContain('`chromatic --exit-zero-on-changes`');
    const rows = block.split('\n').filter((line) => line.startsWith('| branch'));
    expect(rows).toEqual([
      expect.stringMatching(/`react-vite` \| Vite \| npm \| off \| 0 \(OK\) \| \[121\]/),
      expect.stringMatching(
        /`react-webpack5` \| webpack 5 \| npm \| off \| 2 \(BUILD_FAILED\) \| \[125\]/
      ),
      expect.stringMatching(
        /`react-rsbuild` \| rsbuild \| npm \| off \| 0 \(OK\) \| \[123\]\(https:\/\/www\.chromatic\.com\/build\?appId=app123&number=123\) \| 2 captured/
      ),
    ]);
    expect(block).toContain('exited differently across cells:** exit codes 0 2');
    // The CLI got the invocation plus the build script, never --dry-run.
    const diagnostics = JSON.parse(
      readFileSync(join(root, 'runs/test/evidence/m-branch-react-vite-off/d.json'), 'utf8')
    );
    expect(diagnostics.options.argv.slice(0, 3)).toEqual([
      '--build-script-name',
      'build-storybook',
      '--exit-zero-on-changes',
    ]);
  });

  it('adds the monorepos with --package-managers, to --fixtures too, once each', () => {
    const result = matrix(['--fixtures', 'react-vite,react-vite', '--package-managers']);
    const rows = result.stdout.split('\n').filter((line) => line.startsWith('| branch'));
    expect(rows).toEqual([
      expect.stringMatching(/\| `react-vite` \| Vite \| npm \| off \| 0 \(OK\)/),
      expect.stringMatching(/\| `monorepo-pnpm` \| Vite \| pnpm 12 \| off \| 0 \(OK\)/),
    ]);
  });

  it('reports a cell with no diagnostics as not covered', () => {
    addFixture('crashing', 'crash');
    const result = matrix(['--fixtures', 'react-vite,crashing']);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/\| `crashing` .* \| off \| 255 \(-\), ⚠ not covered \|/);
    expect(result.stdout).toContain(
      '- `crashing`, TurboSnap off, branch CLI: not covered. No diagnostics file'
    );
  });

  it("counts this invocation's own build, never the ancestor in .build", () => {
    addFixture('failing', 'failing');
    const result = matrix(['--fixtures', 'failing']);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(
      /\| `failing` .* \| off \| 105 \(NPM_BUILD_STORYBOOK_FAILED\), ⚠ not covered \| \[107\]\(.*\) \| - \|/
    );
    expect(result.stdout).toContain(
      '`failing`, TurboSnap off, branch CLI: not covered. Build 107 was announced'
    );
  });

  it('counts a TurboSnap skip, but not a build skipped some other way', () => {
    addFixture('skipping', 'skipping');
    const turboSnap = matrix(['--fixtures', 'skipping', '--turbosnap']);
    expect(turboSnap.stdout).toMatch(
      /\| `skipping` .* \| 1\.0 \| 0 \(OK\) \| \[42\]\(.*\) \| - \| TurboSnap skipped/
    );
    expect(turboSnap.stdout).not.toContain('`skipping`, TurboSnap 1.0, branch CLI');

    rmSync(join(root, 'runs'), { recursive: true });
    const skip = matrix(['--fixtures', 'react-vite', '--', '--skip']);
    expect(skip.status).toBe(1);
    expect(skip.stdout).toContain(
      '`react-vite`, TurboSnap off, branch CLI: not covered. The CLI skipped the build without TurboSnap'
    );
  });

  it('reports a TurboSnap-off cell where TurboSnap ran as not covered', () => {
    const result = matrix(['--fixtures', 'react-vite', '--', '--only-changed']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      '`react-vite`, TurboSnap off, branch CLI: not covered. TurboSnap ran (from the arguments or a config file)'
    );
  });

  it('counts a TurboSnap cell only when diagnostics show the mode asked for', () => {
    const withoutV2 = matrix(['--turbosnap', '--fixtures', 'react-vite']);
    expect(withoutV2.status).toBe(1);
    expect(withoutV2.stdout).toMatch(/\| `react-vite` .* \| 1\.0 \| 0 \(OK\) \|/);
    expect(withoutV2.stdout).toMatch(/\| `react-vite` .* \| 2\.0 \| 0 \(OK\), ⚠ not covered \|/);
    expect(withoutV2.stdout).toContain(
      "The index didn't apply TurboSnap 2.0, so 1.0 decided this build."
    );
    // The cell published a baseline, then ran the invocation with --only-changed on a new commit.
    const diagnostics = JSON.parse(
      readFileSync(join(root, 'runs/test/evidence/m-branch-react-vite-v1/d.json'), 'utf8')
    );
    expect(diagnostics.options.argv).toContain('--only-changed');
    expect(
      existsSync(join(root, 'runs/test/evidence/m-branch-react-vite-v1-baseline/d.json'))
    ).toBe(true);

    rmSync(join(root, 'runs'), { recursive: true });
    const withV2 = matrix(['--turbosnap', '--fixtures', 'react-vite'], { FAKE_V2: '1' });
    expect(withV2.status, withV2.stdout).toBe(0);
  });

  it('cleanup refuses while a matrix owns the run', () => {
    mkdirSync(join(root, 'runs/test/work'), { recursive: true });
    writeFileSync(join(root, 'runs/test/matrix.pid'), `${process.pid}\n`);
    const result = control(['cleanup']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('a matrix is still running');
    expect(existsSync(join(root, 'runs/test/work'))).toBe(true);
  });

  it('lists a cell that could not run, with the reason, and exits 1', () => {
    addFixture('broken', '@storybook/react-vite');
    const result = matrix(['--fixtures', 'react-vite,broken']);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/\| `react-vite` \| Vite \| npm \| off \| 0 \(OK\)/);
    expect(result.stdout).toContain('**Skipped or not covered (1):**');
    expect(result.stdout).toContain(
      '- `broken`, TurboSnap off, branch CLI: skipped, fixture setup failed (log: matrix/branch-broken-off.fixture.log'
    );
    expect(
      readFileSync(join(root, 'runs/test/evidence/matrix/branch-broken-off.fixture.log'), 'utf8')
    ).toContain('install failed');
  });

  it('repeats every cell with the --compare CLI and lists the cells that differ', () => {
    const result = matrix(['--compare', 'HEAD', '--fixtures', 'react-vite,react-webpack5']);
    const rows = result.stdout.split('\n').filter((line) => /^\| (base|branch) /.test(line));
    expect(rows).toEqual([
      expect.stringMatching(/^\| branch \| `react-vite` .* 0 \(OK\)/),
      expect.stringMatching(/^\| branch \| `react-webpack5` .* 2 \(BUILD_FAILED\)/),
      expect.stringMatching(/^\| base \| `react-vite` .* 0 \(OK\)/),
      expect.stringMatching(/^\| base \| `react-webpack5` .* 0 \(OK\)/),
    ]);
    expect(result.stdout).toContain(
      '**Base and branch differ:**\n- `react-webpack5`, TurboSnap off: base exited 0 (OK) with 2 captured, branch exited 2 (BUILD_FAILED) with 2 captured\n'
    );
    expect(result.stdout).not.toContain('`react-vite`, TurboSnap off: base');
  });
});
