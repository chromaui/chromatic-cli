import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('reports when v1 misses a story that v2 catches', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'turbosnap-parity-'));
  const files = {
    base: path.join(work, 'base.json'),
    current: path.join(work, 'current.json'),
    v1: path.join(work, 'v1.json'),
  };

  writeFileSync(
    files.base,
    JSON.stringify({
      storyFiles: { './src/Button.stories.tsx': 'before' },
      storybookFiles: {},
    })
  );
  writeFileSync(
    files.current,
    JSON.stringify({
      storyFiles: { './src/Button.stories.tsx': 'after' },
      storybookFiles: {},
    })
  );
  writeFileSync(files.v1, JSON.stringify({ status: 'traced', storyFiles: [] }));

  const output = execFileSync(
    process.execPath,
    [path.join(here, 'parity.mjs'), files.base, files.current, files.v1, 'packages/ui'],
    { encoding: 'utf8' }
  );

  assert.match(output, /VERDICT: v1 MISSES a story v2 caught/);
  assert.doesNotMatch(output, /v2 wider \(over-captures/);
});

test('counts an MDX story that v1 found but v2 did not index', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'turbosnap-parity-'));
  const files = {
    base: path.join(work, 'base.json'),
    current: path.join(work, 'current.json'),
    v1: path.join(work, 'v1.json'),
  };

  writeFileSync(files.base, JSON.stringify({ storyFiles: {}, storybookFiles: {} }));
  writeFileSync(files.current, JSON.stringify({ storyFiles: {}, storybookFiles: {} }));
  writeFileSync(
    files.v1,
    JSON.stringify({ status: 'traced', storyFiles: ['packages/ui/src/Badge.stories.mdx'] })
  );

  const result = spawnSync(
    process.execPath,
    [path.join(here, 'parity.mjs'), files.base, files.current, files.v1, 'packages/ui'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /NOT INDEXED BY v2: \.\/src\/Badge\.stories\.mdx/);
  assert.match(result.stdout, /VERDICT: v2 MISSES a story v1 caught/);
});
