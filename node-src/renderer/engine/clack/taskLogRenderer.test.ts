import { taskLog as clackTaskLog } from '@clack/prompts';
import { describe, expect, it, vi } from 'vitest';

import { Task } from '../../../types';
import { clackTaskLogRenderer } from './taskLogRenderer';

vi.mock('@clack/prompts', () => ({
  taskLog: vi.fn(() => ({
    message: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

const taskLogFactory = vi.mocked(clackTaskLog);

interface TaskLogStub {
  message: ReturnType<typeof vi.fn>;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

// a little helper to get the latest task log instance, since in the code under test, the instance is
// closed over and never returned, so we can't access it directly
function lastInstance(): TaskLogStub {
  return taskLogFactory.mock.results.at(-1)?.value;
}

function startedRenderer(title: string): ReturnType<typeof clackTaskLogRenderer> {
  const renderer = clackTaskLogRenderer();
  renderer.start({ title });
  return renderer;
}

const TRANSITION_METHOD = {
  update: 'message',
  succeed: 'success',
  fail: 'error',
} as const;

// a helper that takes in a task state object and a transition method name, runs it through
// the transition method on a renderer instance, and returns the formatted output
function formatVia(transition: keyof typeof TRANSITION_METHOD, state: Task): string {
  const renderer = startedRenderer(state.title);
  renderer[transition](state);
  return lastInstance()[TRANSITION_METHOD[transition]].mock.calls[0][0];
}

describe('clackTaskLogRenderer', () => {
  describe('start', () => {
    it('creates a task log titled with the task title', () => {
      clackTaskLogRenderer().start({ title: 'Authenticating' });

      expect(taskLogFactory).toHaveBeenCalledExactlyOnceWith({
        title: 'Authenticating',
        spacing: 0,
      });
    });

    it('emits the output, without repeating the title (already in the header)', () => {
      clackTaskLogRenderer().start({ title: 'Authenticating', output: 'doing some work' });

      const message = lastInstance().message.mock.calls[0][0];
      expect(message).toContain('doing some work');
      expect(message).not.toContain('Authenticating');
    });

    it('does not emit a message when there is no output', () => {
      clackTaskLogRenderer().start({ title: 'Authenticating' });

      expect(lastInstance().message).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle wiring', () => {
    it('routes update to the task log message', () => {
      const renderer = startedRenderer('Building');
      renderer.update({ title: 'Building', output: 'compiling' });

      expect(lastInstance().message).toHaveBeenCalledOnce();
      expect(lastInstance().success).not.toHaveBeenCalled();
      expect(lastInstance().error).not.toHaveBeenCalled();
    });

    it('routes succeed to the task log success', () => {
      const renderer = startedRenderer('Building');
      renderer.succeed({ title: 'Built' });

      expect(lastInstance().success).toHaveBeenCalledOnce();
      expect(lastInstance().message).not.toHaveBeenCalled();
      expect(lastInstance().error).not.toHaveBeenCalled();
    });

    it('routes fail to the task log error', () => {
      const renderer = startedRenderer('Building');
      renderer.fail({ title: 'Build failed', output: 'boom' });

      expect(lastInstance().error).toHaveBeenCalledOnce();
      expect(lastInstance().message).not.toHaveBeenCalled();
      expect(lastInstance().success).not.toHaveBeenCalled();
    });

    it('reuses a single task log instance across the lifecycle', () => {
      const renderer = startedRenderer('Building');
      renderer.update({ title: 'Building', output: 'compiling' });
      renderer.succeed({ title: 'Built' });

      expect(taskLogFactory).toHaveBeenCalledOnce();
    });
  });

  describe('message formatting', () => {
    it('passes the title alone when there is no output', () => {
      const formatted = formatVia('succeed', { title: 'Done' });

      expect(formatted).toBe('Done');
    });

    it('succeed transition renders title and output', () => {
      const formatted = formatVia('succeed', {
        title: 'Building',
        output: 'compiling',
      });
      expect(formatted).toContain('Building');
      expect(formatted).toContain('compiling');
    });

    it('fail transition renders only title ', () => {
      const formatted = formatVia('fail', {
        title: 'Building',
        output: 'compiling',
      });
      expect(formatted).toContain('Building');
      expect(formatted).not.toContain('compiling');
    });

    it('update renders only output', () => {
      const formatted = formatVia('update', { title: 'Building', output: 'compiling' });

      expect(formatted).not.toContain('Building');
      expect(formatted).toContain('compiling');
    });

    it('update renders title when there is no output', () => {
      const formatted = formatVia('update', { title: 'Building' });
      expect(formatted).toContain('Building');
    });

    it('wraps long terminal-state output across multiple lines', () => {
      const longOutput = 'foo'.repeat(40);
      const formatted = formatVia('succeed', { title: 'Building', output: longOutput });

      expect(formatted.split('\n').length).toBeGreaterThan(2);
    });

    it('wraps long update output across multiple lines', () => {
      const longOutput = 'foo'.repeat(40);
      const formatted = formatVia('update', { title: 'Building', output: longOutput });

      expect(formatted.split('\n').length).toBeGreaterThan(1);
    });
  });
});
