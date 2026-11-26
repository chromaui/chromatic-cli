import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { matchesFile } from '../../node-src/lib/utilities';
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
    branch: 'main',
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

// A git repository with a Storybook whose stats file has this import graph, not yet committed.
function writeProject(imports: Record<string, string[]>) {
  root = mkdtempSync(path.join(tmpdir(), 'chromatic-reach-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  write('.gitignore', 'node_modules\nstorybook-static\n');
  write('node_modules/storybook/package.json', '{ "name": "storybook", "version": "9.1.0" }');
  write('.storybook/main.ts', 'export default {};\n');
  const files = new Set(Object.entries(imports).flatMap(([file, deps]) => [file, ...deps]));
  for (const file of files) write(file, `// ${file}\n`);
  const importers = (file: string) =>
    Object.keys(imports).filter((parent) => imports[parent].includes(file));
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
}

// Doctor's temporary build folder, which these tests leave empty unless they say otherwise.
const reach = (input: DoctorInput) =>
  previewReachChecks(input, path.join(input.cwd, '.doctor-stats'));

describe('previewReachChecks', () => {
  it('reports what preview reaches, by import, and how often it changed', async () => {
    writeProject(graph);
    commit('Add everything', 200);
    write('src/b.ts', '// changed\n');
    commit('Change a file behind the barrel', 5);
    write('src/b.ts', '// changed again\n');
    commit('Change it again', 3);
    write('src/theme.ts', '// changed\n');
    commit('Change the theme', 2);
    write('src/Button.stories.tsx', '// changed\n');
    commit('Change only a story', 1);

    const [check, ...others] = await reach(inputFor(root ?? ''));

    expect(others).toEqual([]);
    expect(check).toMatchObject({
      status: 'warn',
      title: '.storybook/preview.ts reaches 7 project files and 1 package file',
    });
    expect(check.fix).toBeUndefined();
    expect(check.detail).toContain(
      `3 commits in the last 90 days changed one of the project files. (Packages change through the lockfile, so they aren't counted.)
Changed most often:
- src/b.ts: 2 commits
- src/theme.ts: 1 commit
Imports`
    );
    // src/a.ts is also reached through the theme, so removing the barrel keeps it.
    expect(check.detail).toContain(
      '- src/index.ts: 6 project and 0 package files (only through it: 5 and 0); imports 5 files itself, like a barrel'
    );
    expect(check.detail).toContain('- node_modules/pkg/index.js: 0 project and 1 package file');

    // An untraced file recaptures nothing, so neither it nor the commits that changed only it count.
    const [untraced] = await reach({
      ...inputFor(root ?? ''),
      options: { untraced: ['src/b.ts'] },
    });
    expect(untraced.title).toBe('.storybook/preview.ts reaches 6 project files and 1 package file');
    expect(untraced.detail).toContain('1 commit in the last 90 days');
  });

  it("counts a file preview imports directly as no other import's alone", async () => {
    writeProject({
      './.storybook/preview.ts': ['./src/a.ts', './src/index.ts'],
      './src/index.ts': ['./src/a.ts', './src/b.ts'],
      './src/Button.stories.tsx': ['./src/a.ts'],
    });
    commit('Add everything', 200);

    const [check] = await reach(inputFor(root ?? ''));

    expect(check.detail).toContain(
      '- src/index.ts: 3 project and 0 package files (only through it: 2 and 0)'
    );
    expect(check.detail).toContain(
      '- src/a.ts: 1 project and 0 package files (only through it: 0 and 0)'
    );
  });

  it("says so, without passing, when a shallow clone can't tell how often they change", async () => {
    writeProject({
      './.storybook/preview.ts': ['./src/a.ts'],
      './src/Button.stories.tsx': ['./src/a.ts'],
    });
    commit('Add everything', 1);
    const directory = root ?? '';
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' });
    writeFileSync(path.join(directory, '.git', 'shallow'), head);

    const [check] = await reach(inputFor(directory));

    expect(check.status).toBe('info');
    expect(check.detail).toContain(
      "This clone is shallow, so doctor can't tell how often they change."
    );
  });

  it('says how to make a stats file when there is none', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-reach-'));

    const checks = await reach(inputFor(root, 'out'));

    expect(checks).toMatchObject([
      { status: 'info', title: 'No out/preview-stats.json to show what preview imports' },
    ]);
  });

  it('builds Storybook with stats into its own folder only when TurboSnap is on and Chromatic runs the build script', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-reach-'));
    const packageJson = {
      scripts: { 'build-storybook': 'storybook build' },
      devDependencies: { storybook: '^10.0.0' },
    };
    write('package.json', JSON.stringify(packageJson));
    const input = (options: DoctorInput['options']) => ({
      ...inputFor(root ?? ''),
      options,
      packageJson,
    });

    const [on] = await reach(input({ onlyChanged: true }));
    const [off] = await reach(input({}));
    const [otherBranch] = await reach(input({ onlyChanged: 'release/*' }));
    const [prebuilt] = await reach(input({ onlyChanged: true, storybookBuildDir: 'out' }));
    // A custom command writes wherever it writes, which doctor can't redirect.
    const [custom] = await reach(input({ onlyChanged: true, buildCommand: 'npm run build' }));

    const folder = path.join(root, '.doctor-stats');
    expect(on.build).toEqual({
      command: expect.stringContaining(
        `build-storybook --output-dir=${folder} --stats-json=${folder}`
      ),
      statsFile: path.join(folder, 'preview-stats.json'),
    });
    // Shown only when doctor didn't build, such as after --fix turns TurboSnap on, so it doesn't
    // name the build into doctor's own folder, which is gone once doctor exits.
    expect(on.detail).not.toContain(folder);
    expect(on.detail).toContain('Run doctor again to build Storybook with stats');
    expect(off.build).toBeUndefined();
    expect(otherBranch.build).toBeUndefined();
    expect(prebuilt.build).toBeUndefined();
    expect(custom.build).toBeUndefined();

    // Like a TurboSnap build, doctor builds into its own folder, so a stale storybook-static, stats
    // and all, never stands in for that build.
    write('storybook-static/preview-stats.json', '{ "modules": [] }');
    const [existing] = await reach(input({ onlyChanged: true }));
    expect(existing.build?.statsFile).toBe(path.join(folder, 'preview-stats.json'));
  });
});

describe('files TurboSnap cannot see', () => {
  it('lists project stylesheets and assets outside the graph and staticDirs, from the repository root', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-unseen-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    write('.gitignore', 'node_modules\nstorybook-static\n');
    const ui = 'packages/ui';
    write('node_modules/storybook/package.json', '{ "name": "storybook", "version": "9.1.0" }');
    write(`${ui}/.storybook/main.js`, "module.exports = { staticDirs: ['../public'] };\n");
    // The preview imports a stylesheet; a story imports a component, which imports an icon.
    const imports: Record<string, string[]> = {
      '.storybook/preview.ts': ['src/styles.scss'],
      'src/Button.stories.tsx': ['src/Button.tsx'],
      'src/Button.tsx': ['src/icon.svg'],
    };
    const inGraph = [
      ...new Set(Object.entries(imports).flatMap(([file, deps]) => [file, ...deps])),
    ];
    const others = [
      // Seen: in a static dir, named by externals or untraced, not an asset, or in another package.
      `${ui}/public/logo.png`,
      `${ui}/src/legacy.css`,
      `${ui}/src/generated.css`,
      `${ui}/src/Button.test.ts`,
      'packages/other/src/other.css',
      // Unseen: a Sass partial, an image, and a stylesheet whose name has glob characters.
      `${ui}/src/_partial.scss`,
      `${ui}/src/assets/hero.png`,
      `${ui}/src/[theme].scss`,
    ];
    for (const file of [...inGraph.map((f) => `${ui}/${f}`), ...others]) write(file, '');
    const entries: Record<string, string> = {
      '.storybook/preview.ts': './storybook-config-entry.js',
      'src/Button.stories.tsx': './storybook-stories.js',
    };
    const modules = inGraph.map((file, id) => ({
      id,
      name: path.join(root ?? '', ui, file),
      reasons: [
        entries[file],
        ...Object.keys(imports)
          .filter((parent) => imports[parent].includes(file))
          .map((parent) => path.join(root ?? '', ui, parent)),
      ]
        .filter(Boolean)
        .map((moduleName) => ({ moduleName })),
    }));
    write(`${ui}/storybook-static/preview-stats.json`, JSON.stringify({ modules }));
    const cwd = path.join(root, ui);
    const input = {
      ...inputFor(cwd, 'storybook-static'),
      gitRoot: root,
      options: {
        storybookBuildDir: 'storybook-static',
        storybookBaseDir: ui,
        externals: [`${ui}/src/legacy.css`],
        untraced: [`${ui}/src/generated.css`],
      },
      // Uploads a prebuilt Storybook, so a build never runs this script or reads its static dir.
      packageJson: { scripts: { 'build-storybook': 'storybook build -s src' } },
      configEditable: true,
      configKeys: new Set<string>(),
      flagKeys: new Set<string>(),
    } as DoctorInput;

    const all = await reach(input);
    const unseen = all.find((check) => check.title.includes('staticDirs'));

    expect(unseen).toMatchObject({
      status: 'info',
      title: '3 stylesheets, images and fonts outside the module graph and staticDirs',
      fix: { question: 'Does Storybook read these files when it builds?' },
    });
    expect(unseen?.detail).toContain(
      `- ${ui}/src/[theme].scss\n- ${ui}/src/_partial.scss\n- ${ui}/src/assets/hero.png`
    );
    const [edit] = unseen?.fix?.edits ?? [];
    expect(edit.file).toBe(path.join(cwd, 'chromatic.config.json'));
    const { externals } = JSON.parse(edit.content);
    // One glob per file, from the repository root, as TurboSnap matches externals.
    expect(externals).toEqual([
      String.raw`packages/ui/src/\[theme\].scss`,
      'packages/ui/src/_partial.scss',
      'packages/ui/src/assets/hero.png',
    ]);
    // Glob characters in a name are escaped, so the glob matches that file and no other.
    expect(matchesFile(externals[0], `${ui}/src/[theme].scss`)).toBe(true);
    expect(matchesFile(externals[0], `${ui}/src/t.scss`)).toBe(false);
  });
});
