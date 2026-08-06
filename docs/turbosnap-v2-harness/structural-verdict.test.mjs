import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('accepts the exact recapture set for a new imported module', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'turbosnap-structural-verdict-'));
  const base = path.join(work, 'base.json');
  const current = path.join(work, 'current.json');
  const baseIds = path.join(work, 'base.ids');
  const currentIds = path.join(work, 'current.ids');

  writeFileSync(
    base,
    JSON.stringify({
      storyFiles: { './src/lib/Button/Button.stories.tsx': 'before' },
      storybookFiles: {},
    })
  );
  writeFileSync(
    current,
    JSON.stringify({
      storyFiles: { './src/lib/Button/Button.stories.tsx': 'after' },
      storybookFiles: {},
    })
  );
  writeFileSync(baseIds, 'button--primary\n');
  writeFileSync(currentIds, 'button--primary\n');

  const output = execFileSync(
    process.execPath,
    [path.join(here, 'structural-verdict.mjs'), 'new-import', base, current, baseIds, currentIds],
    { encoding: 'utf8' }
  );

  assert.match(output, /PASS new-import/);
});

test('rejects a new imported module that is misclassified as a story', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'turbosnap-structural-verdict-'));
  const base = path.join(work, 'base.json');
  const current = path.join(work, 'current.json');
  const baseIds = path.join(work, 'base.ids');
  const currentIds = path.join(work, 'current.ids');

  writeFileSync(
    base,
    JSON.stringify({
      storyFiles: { './src/lib/Button/Button.stories.tsx': 'before' },
      storybookFiles: {},
    })
  );
  writeFileSync(
    current,
    JSON.stringify({
      storyFiles: {
        './src/lib/Button/Button.stories.tsx': 'after',
        './src/lib/Button/spacing.ts': 'false-story',
      },
      storybookFiles: {},
    })
  );
  writeFileSync(baseIds, 'button--primary\n');
  writeFileSync(currentIds, 'button--primary\n');

  const result = spawnSync(
    process.execPath,
    [path.join(here, 'structural-verdict.mjs'), 'new-import', base, current, baseIds, currentIds],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /got Button\.stories\.tsx, spacing\.ts/);
});
