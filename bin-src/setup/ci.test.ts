import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { readCi, runsFor } from './ci';
import { ciSnippet } from './ciTemplates';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function repoWith(files: Record<string, string>) {
  root = mkdtempSync(path.join(tmpdir(), 'chromatic-ci-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

function runsIn(files: Record<string, string>) {
  return readCi(repoWith(files), Object.keys(files)).runs;
}

describe('readCi', () => {
  it('ignores a command that only mentions chromatic', () => {
    const runs = runsIn({
      '.github/workflows/ci.yml': `on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "npx chromatic runs in another workflow"
`,
    });

    expect(runs).toEqual([]);
  });

  it("judges clone depth per job, and fixes only the Chromatic job's checkout", () => {
    const workflow = `on: [push, pull_request]
jobs:
  release:
    runs-on: ubuntu-latest
    env:
      CHROMATIC_PROJECT_TOKEN: \${{ secrets.TOKEN }} # another job's token isn't this one's
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # for the changelog
      - run: npm run release
  visual:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/ui
    steps:
      - uses: actions/checkout@v4 # keep this comment
      - uses: actions/checkout@v4 # another repository's history doesn't matter
        with: {repository: org/tools, path: tools}
      - run: npx chromatic --only-changed
`;
    const [run, ...others] = runsIn({ '.github/workflows/ci.yml': workflow });

    expect(others).toEqual([]);
    expect(run).toMatchObject({
      job: 'visual',
      directory: 'packages/ui',
      fullHistory: false,
      onPullRequest: true,
      onlyChanged: true,
      passesToken: false,
      prebuilt: false,
    });
    const fixed = run.fullHistoryFix ?? '';
    expect(parse(fixed).jobs.visual.steps[0].with).toEqual({ 'fetch-depth': 0 });
    // Everything else is left as the user wrote it.
    const added = '# keep this comment\n        with:\n          fetch-depth: 0';
    expect(fixed.replace(added, '# keep this comment')).toBe(workflow);
  });

  it('reads the Action step and its workingDir', () => {
    const [run] = runsIn({
      '.github/workflows/chromatic.yml': `on: push
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: chromaui/action@latest
        with:
          workingDir: ./apps/web/
          onlyChanged: false
          projectToken: \${{ secrets.TOKEN }}
          storybookBuildDir: storybook-static
`,
    });

    expect(run).toMatchObject({
      directory: 'apps/web',
      fullHistory: true,
      onlyChanged: false,
      passesToken: true,
      prebuilt: true,
    });
    expect(run.fullHistoryFix).toBeUndefined();
  });

  it('recognises a command that sets variables first, and merges two steps in one job', () => {
    const runs = runsIn({
      '.github/workflows/ci.yml': `on: push
jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - if: github.ref == 'refs/heads/main'
        run: CHROMATIC_PROJECT_TOKEN=$TOKEN npx chromatic --auto-accept-changes
      - if: github.ref != 'refs/heads/main'
        run: (CHROMATIC_PROJECT_TOKEN=$TOKEN npx chromatic --only-changed -d out)
`,
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      job: 'visual',
      directory: '.',
      onlyChanged: true,
      passesToken: true,
      prebuilt: true,
    });
  });

  it('reports a file that does not parse instead of reading part of it', () => {
    const files = {
      '.github/workflows/ci.yml': `on: push
jobs:
  visual:
    steps: [
      - run: npx chromatic
`,
    };

    expect(readCi(repoWith(files), Object.keys(files))).toEqual({
      runs: [],
      unreadable: ['.github/workflows/ci.yml'],
    });
  });

  it('resolves GitLab scripts and clone depth the way GitLab merges them', () => {
    const runs = runsIn({
      '.gitlab-ci.yml': `variables:
  GIT_DEPTH: 0
default:
  before_script:
    - cd packages/ui
.full:
  variables:
    GIT_DEPTH: 0
.shallow:
  variables:
    GIT_DEPTH: 1
  script: npx chromatic --only-changed
inherits-global:
  script: npx chromatic
own-depth-wins:
  extends: .full
  variables:
    GIT_DEPTH: 5
  script: npx chromatic
last-parent-wins:
  extends: [.full, .shallow]
`,
    });

    expect(
      runs.map(({ job, directory, fullHistory, onlyChanged }) => ({
        job,
        directory,
        fullHistory,
        onlyChanged,
      }))
    ).toEqual([
      { job: 'inherits-global', directory: 'packages/ui', fullHistory: true, onlyChanged: false },
      { job: 'own-depth-wins', directory: 'packages/ui', fullHistory: false, onlyChanged: false },
      { job: 'last-parent-wins', directory: 'packages/ui', fullHistory: false, onlyChanged: true },
    ]);
  });
  it('counts a scanned run with no cd for every project, but a parsed job only for its own', () => {
    const runs = runsIn({
      '.circleci/config.yml': `jobs:
  visual:
    working_directory: ~/project/packages/ui
    steps:
      - run: npx chromatic
`,
      '.github/workflows/ci.yml': `on: push
jobs:
  root:
    runs-on: ubuntu-latest
    steps:
      - run: npx chromatic
`,
    });

    expect(runsFor(runs, 'packages/ui')).toMatchObject([{ job: 'visual', confirmed: false }]);
    expect(runsFor(runs, '.')).toHaveLength(2);
  });

  it('reports a shallow checkout reached through an alias, without a fix', () => {
    const [run] = runsIn({
      '.github/workflows/ci.yml': `on: push
jobs:
  visual:
    runs-on: ubuntu-latest
    env:
      CHROMATIC_PROJECT_TOKEN: \${{ secrets.TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with: &clone { fetch-depth: 1 }
      - uses: actions/checkout@v4
        with: *clone
      - run: npx chromatic
`,
    });

    expect(run).toMatchObject({ job: 'visual', fullHistory: false, passesToken: true });
    expect(run.fullHistoryFix).toBeUndefined();
  });

  it('reads the GitLab snippet init prints for a monorepo project', () => {
    const snippet = ciSnippet('gitlab', {
      workingDir: 'packages/ui',
      packageManager: 'pnpm',
      framework: 'playwright',
      secretName: 'CHROMATIC_PROJECT_TOKEN_PACKAGES_UI',
    });

    const runs = runsIn({ '.gitlab-ci.yml': snippet });

    expect(runs).toMatchObject([
      {
        job: 'chromatic-packages-ui',
        directory: 'packages/ui',
        fullHistory: true,
        passesToken: true,
      },
    ]);
    // pnpm comes from Corepack in the node image.
    expect(snippet).toMatch(/^ {4}- corepack enable$/m);
    // Each line runs in its own subshell, so no cd carries over to the next line.
    expect(snippet).not.toMatch(/^\s*- cd /m);
  });
});
