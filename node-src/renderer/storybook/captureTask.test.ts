import { stripVTControlCharacters } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Task } from '../../types';
import { authenticated } from '../../ui/tasks/auth';
import { clackProgressBarRenderer } from '../engine/clack/progressRenderer';
import { captureTask } from './captureTask';
import { environment, options } from './fixtures';

const ESC = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);

const state = () => authenticated({ env: environment, options } as any);

// Output long enough to wrap at a narrow terminal but not at the pinned 80-col width.
const longState = () => ({ status: 'success', title: 'Done', output: 'x'.repeat(60) }) as Task;

const startingUpload = () => ({ status: 'pending', title: 'Uploading', output: '0%' }) as Task;
const uploading = () =>
  ({
    status: 'updating',
    title: 'Uploading',
    output: '4.2/8.0 MB',
    progress: { progress: 4.2 * 1024 * 1024, total: 8 * 1024 * 1024, unit: 'bytes' },
  }) as Task;
const uploadComplete = () =>
  ({ status: 'success', title: 'Publish complete', output: 'Uploaded 5 files (8.0 MB)' }) as Task;
const uploadFailed = () => ({ status: 'error', title: 'Publish failed' }) as Task;

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

  // Clack's progress bar draws only inside its `setInterval` callback, which a synchronous,
  // await-free `drive` would never fire. `withOneTick` fires it once, so the in-progress bar is
  // captured at all — and with no real time or randomness, the bytes are deterministic.
  it('renders the in-progress progress bar via a single deterministic fake tick', () => {
    const frame = captureTask(uploading(), startingUpload(), clackProgressBarRenderer);

    expect(frame).toContain('━'); // the bar glyph rendered, so withOneTick fired the interval
    // The fake tick fires exactly once and `settle` collapses Clack's redraw region, so the bar
    // settles to a single line rather than leaving a stack of partial frames.
    expect(frame.split('\n').filter((line) => line.includes('━'))).toHaveLength(1);
    expect(captureTask(uploading(), startingUpload(), clackProgressBarRenderer)).toBe(frame);
  });

  // The progress renderer deliberately tears the bar down with `clear()` and re-emits the completed
  // line through `clack.log.success` (filled `◆` + `│  ` gutter, matching the taskLog-backed tasks)
  // rather than Clack's own `bar.stop()` (hollow `◇`, no gutter). These assert that real-Clack frame
  // so the two renderers can't drift, and that no leftover bar glyph survives the teardown.
  //
  // The structural assertions run against the ANSI-stripped frame: with color enabled (e.g. CI)
  // picocolors wraps the symbol and the muted output in escape codes, which would split a colored
  // substring like `◆  Publish complete` even though it renders correctly. Stripping keeps the
  // symbol/gutter discrimination color-robust.
  it('renders the success terminal line through the guttered log path, not a bar frame', () => {
    const frame = captureTask(uploadComplete(), startingUpload(), clackProgressBarRenderer);
    const plain = stripVTControlCharacters(frame);

    expect(plain).not.toContain('━'); // bar cleared, and no stray tick re-rendered it
    expect(plain).not.toContain('◇'); // i.e. not Clack's hollow `bar.stop()` line
    expect(plain).toContain('◆  Publish complete');
    expect(plain).toContain('│  Uploaded 5 files (8.0 MB)');
    expect(captureTask(uploadComplete(), startingUpload(), clackProgressBarRenderer)).toBe(frame);
  });

  it('renders the failure terminal line through the log path, not a bar frame', () => {
    const frame = captureTask(uploadFailed(), startingUpload(), clackProgressBarRenderer);
    const plain = stripVTControlCharacters(frame);

    expect(plain).not.toContain('━'); // bar cleared, and no stray tick re-rendered it
    expect(plain).not.toContain('◇'); // i.e. not Clack's hollow `bar.error()` line
    expect(plain).toContain('■  Publish failed');
    expect(captureTask(uploadFailed(), startingUpload(), clackProgressBarRenderer)).toBe(frame);
  });
});
