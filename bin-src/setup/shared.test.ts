import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isEditableJson, rewriteJson, tokenEnvironmentEdits } from './shared';

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
    // Git doesn't read ./.env as .env, though it looks like it covers it.
    const gitRoot = repoWith({ '.gitignore': 'node_modules\n./.env\n' });

    const { edits, reason } = tokenEnvironmentEdits(gitRoot, gitRoot, 'chpt_abc123');

    expect(reason).toBeUndefined();
    expect(edits).toEqual([
      { file: path.join(gitRoot, '.env'), content: 'CHROMATIC_PROJECT_TOKEN=chpt_abc123\n' },
      {
        file: path.join(gitRoot, '.gitignore'),
        content: 'node_modules\n./.env\n\n# Chromatic\n.env\n',
      },
    ]);
  });

  it("adds to init's own section instead of starting another", () => {
    const gitRoot = repoWith({ '.gitignore': 'node_modules\n\n# Chromatic\nchromatic.log\n' });

    const { edits } = tokenEnvironmentEdits(gitRoot, gitRoot, 'chpt_abc123');

    expect(edits?.[1]).toEqual({
      file: path.join(gitRoot, '.gitignore'),
      content: 'node_modules\n\n# Chromatic\nchromatic.log\n.env\n',
    });
  });

  it('only writes .env when git already ignores it, replacing an old token', () => {
    const gitRoot = repoWith({
      '.git/info/exclude': '.env\n',
      '.env': 'CHROMATIC_PROJECT_TOKEN=chpt_old\nOTHER=1',
    });

    const { edits } = tokenEnvironmentEdits(gitRoot, gitRoot, 'chpt_abc123');

    expect(edits).toEqual([
      {
        file: path.join(gitRoot, '.env'),
        content: 'CHROMATIC_PROJECT_TOKEN=chpt_abc123\nOTHER=1',
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

const crlf = (text: string) => text.replaceAll('\n', '\r\n');

describe('rewriteJson', () => {
  it('edits a config file with comments in place, keeping every comment', () => {
    const before = `{
  // Where Storybook's config lives
  "storybookConfigDir": "old", // set by hand
  "storybookBaseDir": "apps/web",
  /* TurboSnap */
  "untraced": ["a/**"] // keep
}
`;
    expect(isEditableJson(before)).toBe(true);

    const after = rewriteJson(
      { storybookConfigDir: 'new', untraced: ['a/**'], onlyChanged: true, externals: ['b', 'c'] },
      before
    );

    expect(after).toBe(`{
  // Where Storybook's config lives
  "storybookConfigDir": "new", // set by hand
  /* TurboSnap */
  "untraced": ["a/**"], // keep
  "onlyChanged": true,
  "externals": ["b", "c"]
}
`);
  });

  it('adds keys to package.json without reformatting the rest, in either line ending', () => {
    const before = `{
  "name": "my-app",
  "scripts": {
    "build-storybook": "storybook build"
  },
  "eslintConfig": {
    "extends": [
      "react-app"
    ]
  },
  "browserslist": ["defaults"],
  "devDependencies": {
    "storybook": "^9.0.0"
  }
}
`;
    const json = JSON.parse(before);
    json.scripts.chromatic = 'chromatic';
    json.devDependencies.chromatic = '^13.0.0';
    const expected = before
      .replace('"storybook build"', '"storybook build",\n    "chromatic": "chromatic"')
      .replace('"^9.0.0"', '"^9.0.0",\n    "chromatic": "^13.0.0"');

    expect(rewriteJson(json, before)).toBe(expected);
    expect(rewriteJson(json, crlf(before))).toBe(crlf(expected));
  });

  it('keeps plain JSON valid when it removes the last key, and keeps an array wrapped', () => {
    const before = `{
  "onlyChanged": "true",
  "untraced": [
    "a/**"
  ],
  "storybookBaseDir": "x"
}
`;

    const after = rewriteJson({ onlyChanged: true, untraced: ['a/**', 'b/**'] }, before);

    expect(after).toBe(`{
  "onlyChanged": true,
  "untraced": [
    "a/**",
    "b/**"
  ]
}
`);
  });

  it('changes or removes the copy of a repeated key that parsers read, and drops the others', () => {
    const before = `{\n  "onlyChanged": false,\n  "untraced": [],\n  "onlyChanged": "true",\n  "untraced": ["a"]\n}\n`;

    expect(rewriteJson({ onlyChanged: true }, before)).toBe(`{\n  "onlyChanged": true\n}\n`);
    expect(rewriteJson({ onlyChanged: true }, `{"onlyChanged":false,"onlyChanged":"true"}\n`)).toBe(
      `{\n  "onlyChanged": true\n}\n`
    );
  });

  it("won't edit JSON5 syntax it can't keep", () => {
    expect(isEditableJson(`{ storybookConfigDir: 'x' }`)).toBe(false);
  });
});
