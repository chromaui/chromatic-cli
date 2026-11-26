import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Check } from './checks';
import { applyFixes, doctorCommand } from './report';

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
