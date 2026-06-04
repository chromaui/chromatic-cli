import { log as clackLog, progress as clackProgress } from '@clack/prompts';
import { describe, expect, it, vi } from 'vitest';

import { clackProgressBarRenderer } from './progressRenderer';

vi.mock('@clack/prompts', () => ({
  progress: vi.fn(() => ({
    start: vi.fn(),
    advance: vi.fn(),
    message: vi.fn(),
    stop: vi.fn(),
    error: vi.fn(),
    clear: vi.fn(),
  })),
  log: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const progressFactory = vi.mocked(clackProgress);

function lastBar() {
  return progressFactory.mock.results.at(-1)?.value as {
    start: ReturnType<typeof vi.fn>;
    advance: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

function started(title = 'Uploading') {
  const renderer = clackProgressBarRenderer();
  renderer.start({ title });
  return renderer;
}

describe('clackProgressBarRenderer', () => {
  it('starts a percent-based bar and labels it with the task title', () => {
    started('Uploading');

    expect(progressFactory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max: 100, style: 'heavy' })
    );
    expect(lastBar().start).toHaveBeenCalledExactlyOnceWith('Uploading');
  });

  it('advances by the delta percent between absolute progress updates', () => {
    const renderer = started('Uploading');
    const total = 200;

    renderer.update({ title: 'Uploading', progress: { progress: 50, total, unit: 'snapshots' } });
    renderer.update({ title: 'Uploading', progress: { progress: 100, total, unit: 'snapshots' } });

    // 50/200 = 25%, then 100/200 = 50% — so two +25 advances, not an absolute set.
    expect(lastBar().advance.mock.calls.map((c) => c[0])).toEqual([25, 25]);
  });

  it('clamps a negative progress to a 0% fill rather than moving the bar backwards', () => {
    const renderer = started('Uploading');

    // A negative percent would drive Clack's internal count below zero and crash its
    // `'━'.repeat(count)` fill, so the renderer clamps the percent to [0,100].
    renderer.update({ title: 'Uploading', progress: { progress: -10, total: 200, unit: 'bytes' } });

    expect(lastBar().advance.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it('passes state.output through verbatim as the bar label', () => {
    const renderer = started('Uploading');

    renderer.update({
      title: 'Uploading',
      output: '4.0/8.0 MB',
      progress: { progress: 1, total: 2, unit: 'bytes' },
    });

    expect(lastBar().advance.mock.calls.at(-1)?.[1]).toBe('4.0/8.0 MB');
  });

  it('falls back to the task title as the label when output is absent', () => {
    const renderer = started('Uploading');

    renderer.update({
      title: 'Uploading',
      progress: { progress: 3, total: 12, unit: 'snapshots' },
    });

    expect(lastBar().advance.mock.calls.at(-1)?.[1]).toBe('Uploading');
  });

  it('treats an update without numeric progress as a text state change', () => {
    const renderer = started('Uploading');

    renderer.update({ title: 'Uploading', output: 'finalizing' });

    expect(lastBar().message).toHaveBeenCalledExactlyOnceWith('finalizing');
    expect(lastBar().advance).not.toHaveBeenCalled();
  });

  // Clack's `stop`/`error` hardcode a hollow `◇` and skip the per-line gutter, so the terminal
  // frame is emitted through `clack.log.*` (matching `clackTaskLogRenderer`) after `clear()` tears
  // the bar down without writing — never through the bar's own `stop`/`error`.
  it('clears the bar and emits a guttered success line through the log path on success', () => {
    const renderer = started('Uploading');

    renderer.succeed({ title: 'Publish complete', output: 'Uploaded 5 files (8.0 MB)' });

    expect(lastBar().clear).toHaveBeenCalledOnce();
    expect(lastBar().stop).not.toHaveBeenCalled();
    const [message, options] = vi.mocked(clackLog.success).mock.calls.at(-1) ?? [];
    expect(message).toContain('Publish complete');
    expect(message).toContain('Uploaded 5 files (8.0 MB)');
    expect(options).toMatchObject({ spacing: 0 });
  });

  it('clears the bar and emits the failure title through the log path on failure', () => {
    const renderer = started('Uploading');

    renderer.fail({ title: 'Upload failed' });

    expect(lastBar().clear).toHaveBeenCalledOnce();
    expect(lastBar().error).not.toHaveBeenCalled();
    const [message, options] = vi.mocked(clackLog.error).mock.calls.at(-1) ?? [];
    expect(message).toContain('Upload failed');
    expect(options).toMatchObject({ spacing: 0 });
  });
});
