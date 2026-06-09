import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Task } from '../../types';
import { authenticated } from '../../ui/tasks/auth';
import { captureTask } from './captureTask';
import { environment, options } from './fixtures';

const ESC = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);

const state = () => authenticated({ env: environment, options } as any);

// Output long enough to wrap at a narrow terminal but not at the pinned 80-col width.
const longState = () => ({ status: 'success', title: 'Done', output: 'x'.repeat(60) }) as Task;

describe('captureTask', () => {
  // These assert only what wouldn't be captured in the regular Chromatic diff (the big one being hyperlinks)
  let previousColumns: number | undefined;

  beforeEach(() => {
    previousColumns = process.stdout.columns;
    // Force the hyperlink-capable branch of `supportsHyperlinks` (the default) so the OSC 8
    // assertion is deterministic regardless of the developer's terminal.
    vi.stubEnv('TERM_PROGRAM', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.stdout.columns = previousColumns as number;
  });

  it('wraps the docs URL in an OSC 8 hyperlink (invisible to a pixel diff)', () => {
    const output = captureTask(state());

    expect(output).toContain(`${ESC}]8;;https://www.chromatic.com/docs/${BEL}`);
  });

  it('produces identical output whether or not the ambient env is CI', () => {
    vi.stubEnv('CI', 'true');
    const inCI = captureTask(state());

    vi.stubEnv('CI', '');
    const notInCI = captureTask(state());

    expect(inCI).toBe(notInCI);
  });

  it('restores the ambient CI value after capturing', () => {
    vi.stubEnv('CI', 'true');
    captureTask(state());

    expect(process.env.CI).toBe('true');
  });

  it('leaves CI unset after capturing when it started unset', () => {
    vi.stubEnv('CI', undefined);
    captureTask(state());

    expect('CI' in process.env).toBe(false);
  });

  it('produces identical output regardless of the ambient terminal width', () => {
    process.stdout.columns = 50;
    const narrow = captureTask(longState());

    process.stdout.columns = 200;
    const wide = captureTask(longState());

    expect(narrow).toBe(wide);
  });

  it('restores the ambient terminal width after capturing', () => {
    process.stdout.columns = 123;
    captureTask(state());

    expect(process.stdout.columns).toBe(123);
  });
});
