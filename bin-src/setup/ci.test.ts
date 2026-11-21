import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { findChromaticRuns } from './ci';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function runsIn(files: Record<string, string>) {
  root = mkdtempSync(path.join(tmpdir(), 'chromatic-ci-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return findChromaticRuns(root, Object.keys(files));
}

describe('findChromaticRuns', () => {
  it('ignores a comment that mentions chromatic', () => {
    const runs = runsIn({
      '.github/workflows/ci.yml': `on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      # TODO: run npx chromatic here
      - uses: actions/checkout@v4
      - run: npm test
`,
    });

    expect(runs).toEqual([]);
  });

  it("judges clone depth per job, and fixes only the Chromatic job's checkout", () => {
    const workflow = `on: [push, pull_request]
jobs:
  release:
    runs-on: ubuntu-latest
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
`,
    });

    expect(run).toMatchObject({ directory: 'apps/web', fullHistory: true, onlyChanged: false });
    expect(run.fullHistoryFix).toBeUndefined();
  });

  it('takes GitLab clone depth from the job, then its templates, then the global variables', () => {
    const runs = runsIn({
      '.gitlab-ci.yml': `variables:
  GIT_DEPTH: 0
.shallow:
  variables:
    GIT_DEPTH: 10
inherits-global:
  script:
    - cd packages/ui
    - npx chromatic
uses-template:
  extends: .shallow
  script: npx chromatic
`,
    });

    expect(
      runs.map(({ job, directory, fullHistory }) => ({ job, directory, fullHistory }))
    ).toEqual([
      { job: 'inherits-global', directory: 'packages/ui', fullHistory: true },
      { job: 'uses-template', directory: '.', fullHistory: false },
    ]);
    const fixed = parse(runs[1].fullHistoryFix ?? '');
    expect(fixed['uses-template'].variables).toEqual({ GIT_DEPTH: 0 });
    expect(fixed['.shallow'].variables).toEqual({ GIT_DEPTH: 10 });
  });
});
