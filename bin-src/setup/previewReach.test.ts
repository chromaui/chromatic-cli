import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { DoctorInput } from './doctorInput';
import { previewReachChecks } from './previewReach';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(root ?? '', file)), { recursive: true });
  writeFileSync(path.join(root ?? '', file), content);
}

function commit(message: string, daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const environment = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const run = (args: string[]) => execFileSync('git', args, { cwd: root, env: environment });
  run(['add', '-A']);
  run(['-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', message]);
}

function inputFor(cwd: string, statsDirectory?: string) {
  return {
    cwd,
    gitRoot: cwd,
    options: { storybookBuildDir: statsDirectory },
    storybookConfigDirectory: path.join(cwd, '.storybook'),
  } as DoctorInput;
}

// A preview that imports a barrel (src/index.ts), a theme that also imports one of the barrel's
// files, and a package. A story imports a file the preview reaches too.
const graph: Record<string, string[]> = {
  './.storybook/preview.ts': ['./src/index.ts', './src/theme.ts', './node_modules/pkg/index.js'],
  './src/index.ts': ['./src/a.ts', './src/b.ts', './src/c.ts', './src/d.ts', './src/e.ts'],
  './src/theme.ts': ['./src/a.ts'],
  './src/Button.stories.tsx': ['./src/a.ts'],
};

describe('previewReachChecks', () => {
  it('reports what preview reaches, by import, and how often it changed', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-reach-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    write('.gitignore', 'node_modules\nstorybook-static\n');
    write('node_modules/storybook/package.json', '{ "name": "storybook", "version": "9.1.0" }');
    write('.storybook/main.ts', 'export default {};\n');
    const files = new Set(Object.entries(graph).flatMap(([file, deps]) => [file, ...deps]));
    for (const file of files) write(file, `// ${file}\n`);
    const importers = (file: string) =>
      Object.keys(graph).filter((parent) => graph[parent].includes(file));
    const entries: Record<string, string> = {
      './.storybook/preview.ts': './storybook-config-entry.js',
      './src/Button.stories.tsx': './storybook-stories.js',
    };
    const modules = [...files].map((file, id) => ({
      id,
      name: path.join(root ?? '', file),
      reasons: [entries[file], ...importers(file).map((p) => path.join(root ?? '', p))]
        .filter(Boolean)
        .map((moduleName) => ({ moduleName })),
    }));
    write('storybook-static/preview-stats.json', JSON.stringify({ modules }));
    commit('Add everything', 200);
    write('src/b.ts', '// changed\n');
    commit('Change a file behind the barrel', 5);
    write('src/b.ts', '// changed again\n');
    commit('Change it again', 3);
    write('src/theme.ts', '// changed\n');
    commit('Change the theme', 2);
    write('src/Button.stories.tsx', '// changed\n');
    commit('Change only a story', 1);

    const [check, ...others] = await previewReachChecks(inputFor(root));

    expect(others).toEqual([]);
    expect(check).toMatchObject({
      status: 'warn',
      title: '.storybook/preview.ts reaches 7 project files and 1 package file',
    });
    expect(check.fix).toBeUndefined();
    expect(check.detail).toContain(
      '3 commits in the last 90 days changed one of the project files, and each recaptured every story. Most often: src/b.ts (2), src/theme.ts (1).'
    );
    // src/a.ts is also reached through the theme, so removing the barrel keeps it.
    expect(check.detail).toContain(
      '- src/index.ts: 6 project and 0 package files (only through it: 5 and 0); imports 5 files itself, like a barrel'
    );
    expect(check.detail).toContain('- node_modules/pkg/index.js: 0 project and 1 package file');
  });

  it('says how to make a stats file when there is none', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-reach-'));

    const checks = await previewReachChecks(inputFor(root, 'out'));

    expect(checks).toMatchObject([
      { status: 'info', title: 'No out/preview-stats.json to show what preview imports' },
    ]);
  });
});
