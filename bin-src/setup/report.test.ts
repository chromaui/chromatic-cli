import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Check } from './checks';
import { applyFixes } from './report';

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
