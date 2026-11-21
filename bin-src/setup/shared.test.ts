import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { tokenEnvironmentEdits } from './shared';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function repoWith(files: Record<string, string>, tracked: string[] = []) {
  root = mkdtempSync(path.join(tmpdir(), 'chromatic-env-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  if (tracked.length > 0) execFileSync('git', ['add', '-f', ...tracked], { cwd: root });
  return root;
}

describe('tokenEnvironmentEdits', () => {
  it('writes .env and ignores it when nothing covers it yet', () => {
    const gitRoot = repoWith({ '.gitignore': 'node_modules\n' });

    const { edits, reason } = tokenEnvironmentEdits(gitRoot, gitRoot, 'chpt_abc123');

    expect(reason).toBeUndefined();
    expect(edits).toEqual([
      { file: path.join(gitRoot, '.env'), content: 'CHROMATIC_PROJECT_TOKEN=chpt_abc123\n' },
      { file: path.join(gitRoot, '.gitignore'), content: 'node_modules\n\n# Chromatic\n.env\n' },
    ]);
  });

  it('only writes .env when a pattern already ignores it', () => {
    const gitRoot = repoWith({ '.gitignore': '*.env\n.env\n', '.env': 'OTHER=1' });

    const { edits } = tokenEnvironmentEdits(gitRoot, gitRoot, 'chpt_abc123');

    expect(edits).toEqual([
      {
        file: path.join(gitRoot, '.env'),
        content: 'OTHER=1\nCHROMATIC_PROJECT_TOKEN=chpt_abc123\n',
      },
    ]);
  });

  it.each([
    ['.gitignore un-ignores it', { '.gitignore': '.env\n!.env\n' }, [], '.'],
    [
      'a nested .gitignore un-ignores it',
      { 'packages/ui/.gitignore': '!.env\n' },
      [],
      'packages/ui',
    ],
    ['git tracks it', { '.gitignore': '.env\n', '.env': 'OTHER=1\n' }, ['.env'], '.'],
  ])('refuses when %s', (_, files, tracked, directory) => {
    const gitRoot = repoWith(files, tracked);

    const { edits, reason } = tokenEnvironmentEdits(
      gitRoot,
      path.join(gitRoot, directory),
      'chpt_abc123'
    );

    expect(edits).toBeUndefined();
    expect(reason).toContain('would be committed');
  });
});
