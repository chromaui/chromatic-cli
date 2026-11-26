import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Project } from './detect';
import { FileWriter } from './shared';
import { tokenStep } from './token';

vi.mock('@clack/prompts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clack/prompts')>();
  return {
    ...original,
    confirm: vi.fn(async () => true),
    spinner: () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() }),
  };
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'token-test-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  vi.stubEnv('CHROMATIC_PROJECT_TOKEN', '');
  // Nothing answers, so the token check gives up at once.
  vi.stubEnv('CHROMATIC_INDEX_URL', 'http://127.0.0.1:9');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(clack.confirm).mockClear();
  rmSync(root, { recursive: true, force: true });
});

const run = (interactive: boolean, projectToken: string) =>
  tokenStep(
    { gitRoot: root, interactive, writer: new FileWriter(false, root), flags: { projectToken } },
    { directory: root } as Project
  );

it('offers to save a --project-token token in a terminal', async () => {
  await run(true, 'chpt_flag');

  expect(clack.confirm).toHaveBeenCalledOnce();
  expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('CHROMATIC_PROJECT_TOKEN=chpt_flag\n');
});

it('saves nothing from --project-token when the answer is no', async () => {
  vi.mocked(clack.confirm).mockResolvedValueOnce(false);

  await run(true, 'chpt_flag');

  expect(existsSync(path.join(root, '.env'))).toBe(false);
});

it.each([
  ['without a terminal', false, ''],
  ['when CHROMATIC_PROJECT_TOKEN already holds it', true, 'chpt_flag'],
])('neither asks nor saves a --project-token token %s', async (_, interactive, environment) => {
  vi.stubEnv('CHROMATIC_PROJECT_TOKEN', environment);

  await run(interactive, 'chpt_flag');

  expect(clack.confirm).not.toHaveBeenCalled();
  expect(existsSync(path.join(root, '.env'))).toBe(false);
});
