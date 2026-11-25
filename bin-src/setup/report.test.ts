import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import * as clack from '@clack/prompts';
import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Check } from './checks';
import { applyFixes, doctorCommand, showEdits } from './report';

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clack/prompts')>()),
  note: vi.fn(),
  select: vi.fn(),
}));

vi.mock('execa', () => ({ execa: vi.fn() }));

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('applyFixes', () => {
  it('applies fixes with --yes, but not one that asks how CI runs Chromatic', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-fixes-'));
    const plain = path.join(root, 'plain.json');
    const asked = path.join(root, 'asked.json');
    const checks: Check[] = [
      {
        group: 'Values',
        status: 'warn',
        title: 'Needs a question',
        fix: {
          summary: 'Change asked.json',
          edits: [{ file: asked, content: '{}\n' }],
          question: 'Does CI run Chromatic from packages/ui?',
        },
      },
      {
        group: 'Values',
        status: 'warn',
        title: 'Plain',
        fix: { summary: 'Change plain.json', edits: [{ file: plain, content: '{}\n' }] },
      },
    ];

    await applyFixes(async () => checks, { cwd: root, yes: true });

    expect(readFileSync(plain, 'utf8')).toBe('{}\n');
    expect(existsSync(asked)).toBe(false);
  });
});

describe('applyFixes with choices', () => {
  it('applies the choice picked in a terminal, or nothing, and --yes applies the fix itself', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-choices-'));
    const file = path.join(root, 'package.json');
    const update = (to: string) => ({ summary: `Update to ${to}`, edits: [{ file, content: to }] });
    // Like the version check, it reads package.json again on each recheck. This one models a
    // recheck where only the major is left after the update, as a fix with a question.
    const recheck = async (): Promise<Check[]> => {
      const now = existsSync(file) ? readFileSync(file, 'utf8') : 'old';
      let fix: Check['fix'];
      if (now === 'old') {
        fix = {
          ...update('minor'),
          choices: ['major', 'minor', 'patch'].map((key) => ({
            key,
            label: key,
            ...(key === 'major' && { warning: 'Read the release notes' }),
            fix: update(key),
          })),
        };
      } else if (now !== 'major') {
        fix = { ...update('major'), question: 'Update across a major version?' };
      }
      return [{ group: 'Loading', status: 'warn', title: 'Behind', fix }];
    };

    vi.mocked(clack.select).mockResolvedValueOnce('patch');
    await applyFixes(recheck, { cwd: root, yes: false });
    expect(readFileSync(file, 'utf8')).toBe('patch');
    // The select starts on the first choice without a warning, never on the major.
    expect(clack.select).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'minor' }));
    // The major, turned down in that choice, isn't offered again after the recheck.
    expect(clack.select).toHaveBeenCalledOnce();

    rmSync(file);
    vi.mocked(clack.select).mockResolvedValueOnce('');
    await applyFixes(recheck, { cwd: root, yes: false });
    expect(existsSync(file)).toBe(false);

    await applyFixes(recheck, { cwd: root, yes: true });
    expect(readFileSync(file, 'utf8')).toBe('minor');
    expect(clack.select).toHaveBeenCalledTimes(2);
  });
});

describe('applyFixes installs', () => {
  it('once after the fixes that change dependencies, and fails a check when it fails', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-install-'));
    const directory = root;
    const fix = (name: string) => ({
      group: 'Loading' as const,
      status: 'warn' as const,
      title: name,
      fix: {
        summary: `Add ${name}`,
        install: true,
        edits: [{ file: path.join(directory, name), content: '' }],
      },
    });
    const checks = [fix('a'), fix('b')];
    // The lockfile says npm, whichever package manager runs the tests, even with TMPDIR inside
    // another project's checkout: its own repository makes this folder the root detection reads.
    writeFileSync(path.join(root, 'package-lock.json'), '{}');
    execFileSync('git', ['init', '-q'], { cwd: root });

    await applyFixes(async () => checks, { cwd: root, yes: true });
    expect(execa).toHaveBeenCalledOnce();
    expect(execa).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: root }));

    vi.mocked(execa).mockRejectedValueOnce(
      Object.assign(new Error('x'), { all: 'E404 chromatic' })
    );
    const after = await applyFixes(async () => checks, { cwd: root, yes: true });
    expect(after.at(-1)).toMatchObject({ status: 'fail', title: 'npm install failed' });
  });
});

describe('doctorCommand', () => {
  it('repeats the arguments doctor ran with, without its own flags or a token', () => {
    expect(
      doctorCommand(
        ['--config-file', 'my config.json', '-t', 'chpt_secret', '--only-changed=release/*', '-y'],
        ['--fix']
      )
    ).toBe("npx chromatic doctor --config-file 'my config.json' '--only-changed=release/*' --fix");
    expect(
      doctorCommand(['--project-token=chpt_secret', '--fix', '-c', "it's.json"], ['--fix'])
    ).toBe(String.raw`npx chromatic doctor -c 'it'\''s.json' --fix`);
  });

  it('leaves out a token in every form the parser takes', () => {
    for (const argv of [
      ['--projectToken', 'chpt_secret'],
      ['--projectToken=chpt_secret'],
      ['-yt', 'chpt_secret'],
      ['-tchpt_secret'],
      ['-tchpt_secrett'],
      ['-y'],
    ]) {
      expect(doctorCommand([...argv, '--project', 'ui'], ['--fix'])).toBe(
        'npx chromatic doctor --project ui --fix'
      );
    }
    expect(doctorCommand(['-yc', 'a.json'], ['--fix'])).toBe(
      'npx chromatic doctor -c a.json --fix'
    );
  });
});

describe('showEdits', () => {
  it('masks project tokens in package scripts', () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-edits-'));
    const file = path.join(root, 'package.json');
    const scripts = {
      a: 'chromatic --project-token=legacy0token9876',
      b: 'chromatic -t chpt_a1b2c3d4e5f6',
    };
    writeFileSync(file, JSON.stringify({ scripts }));

    showEdits(
      'Add chromatic',
      [{ file, content: JSON.stringify({ scripts, devDependencies: {} }) }],
      root
    );

    const preview = vi.mocked(clack.note).mock.calls[0][0];
    expect(preview).not.toContain('legacy0token9876');
    expect(preview).not.toContain('chpt_a1b2c3d4e5f6');
    expect(preview).toContain('--project-token=…9876');
    expect(preview).toContain('-t …e5f6');
  });

  it('shows an added line in place: its parent key, the line before it and the closing brace', () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-edits-'));
    const file = path.join(root, 'package.json');
    writeFileSync(
      file,
      '{\n  "scripts": {\n    "build": "vite build",\n    "test": "vitest"\n  }\n}\n'
    );
    const content =
      '{\n  "scripts": {\n    "build": "vite build",\n    "test": "vitest",\n    "chromatic": "chromatic"\n  }\n}\n';

    showEdits('Add a script', [{ file, content }], root);

    const preview = stripVTControlCharacters(vi.mocked(clack.note).mock.calls.at(-1)?.[0] ?? '');
    expect(preview).toBe(
      [
        'package.json',
        '    "scripts": {',
        '      ...',
        '      "test": "vitest",',
        '+     "chromatic": "chromatic"',
        '    }',
      ].join('\n')
    );
  });

  it('shows no line with a value as context, and a comma outside JSON as a change', () => {
    root = mkdtempSync(path.join(tmpdir(), 'chromatic-edits-'));
    const config = path.join(root, 'chromatic.config.jsonc');
    writeFileSync(
      config,
      '{\n  "buildCommand": "KEY=secret9876 build", "untraced": [\n    "a"\n  ]\n}\n'
    );
    const environment = path.join(root, '.env');
    writeFileSync(environment, 'CHROMATIC_PROJECT_TOKEN=abcd1234\n');

    showEdits(
      'Fix',
      [
        {
          file: config,
          content: '{\n  "buildCommand": "KEY=secret9876 build", "untraced": [\n    "b"\n  ]\n}\n',
        },
        { file: environment, content: 'CHROMATIC_PROJECT_TOKEN=abcd1234,\n' },
      ],
      root
    );

    const preview = stripVTControlCharacters(vi.mocked(clack.note).mock.calls.at(-1)?.[0] ?? '');
    expect(preview).not.toContain('secret9876');
    expect(preview).toContain('- CHROMATIC_PROJECT_TOKEN=');
    expect(preview).toContain('+ CHROMATIC_PROJECT_TOKEN=');
  });
});
