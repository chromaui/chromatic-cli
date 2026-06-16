import { log as clackLog, spinner as clackSpinner } from '@clack/prompts';
import { describe, expect, it, vi } from 'vitest';

import { clackSpinnerRenderer } from './spinnerRenderer';

vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
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

const spinnerFactory = vi.mocked(clackSpinner);

function lastSpinner() {
  return spinnerFactory.mock.results.at(-1)?.value as {
    start: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
}

function started(title = 'Building') {
  const renderer = clackSpinnerRenderer();
  renderer.start({ title });
  return renderer;
}

describe('clackSpinnerRenderer', () => {
  it('starts a spinner labeled with the task title', () => {
    started('Building');

    expect(spinnerFactory).toHaveBeenCalledOnce();
    expect(lastSpinner().start).toHaveBeenCalledExactlyOnceWith('Building');
  });

  it('relabels the spinner with state.output on update', () => {
    const renderer = started('Building');

    renderer.update({ title: 'Building', output: 'Compiling 42 modules' });

    expect(lastSpinner().message).toHaveBeenCalledExactlyOnceWith('Compiling 42 modules');
  });

  it('falls back to the task title as the message when output is absent', () => {
    const renderer = started('Building');

    renderer.update({ title: 'Building' });

    expect(lastSpinner().message).toHaveBeenCalledExactlyOnceWith('Building');
  });

  // Clack's `stop`/`error` hardcode a hollow `◇` and skip the per-line gutter, so the terminal
  // frame is emitted through `clack.log.*` (matching `clackTaskLogRenderer`) after `clear()` tears
  // the spinner down without writing — never through the spinner's own `stop`/`error`.
  it('clears the spinner and emits a guttered success line through the log path on success', () => {
    const renderer = started('Building');

    renderer.succeed({ title: 'Build complete', output: 'Built 42 stories' });

    expect(lastSpinner().clear).toHaveBeenCalledOnce();
    expect(lastSpinner().stop).not.toHaveBeenCalled();
    const [message, options] = vi.mocked(clackLog.success).mock.calls.at(-1) ?? [];
    expect(message).toContain('Build complete');
    expect(message).toContain('Built 42 stories');
    expect(options).toMatchObject({ spacing: 0 });
  });

  it('clears the spinner and emits the failure title through the log path on failure', () => {
    const renderer = started('Building');

    renderer.fail({ title: 'Build failed' });

    expect(lastSpinner().clear).toHaveBeenCalledOnce();
    expect(lastSpinner().error).not.toHaveBeenCalled();
    const [message, options] = vi.mocked(clackLog.error).mock.calls.at(-1) ?? [];
    expect(message).toContain('Build failed');
    expect(options).toMatchObject({ spacing: 0 });
  });
});
