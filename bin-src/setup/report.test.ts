import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Check } from './checks';
import { applyFixes, doctorCommand } from './report';

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
