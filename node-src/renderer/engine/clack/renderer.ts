import { Writable } from 'node:stream';

import { taskLog as clackTaskLog } from '@clack/prompts';

import { Task } from '../../../types';
import { TaskRenderer } from '../index';
import { CLI_COLORS } from './colors';
import { wrapTextForClack } from './wrap';

/**
 * Create a Clack task-log-backed `TaskRenderer` for a single task. Used for short-running tasks.
 *
 * @param output Stream Clack writes to. Defaults to `process.stdout`; the Storybook capture
 * harness injects an in-memory sink instead.
 *
 * @returns A `TaskRenderer` that renders via a Clack task log.
 */
export function clackTaskLogRenderer(output?: Writable): TaskRenderer {
  let taskLog: ReturnType<typeof clackTaskLog>;

  return {
    start: (state: Task) => {
      taskLog = clackTaskLog({ title: state.title, spacing: 0, output });
      // The title is already rendered in the task log header, so the initial message is just the
      // (muted, wrapped) output rather than the full title+output formatting used elsewhere.
      if (state.output) taskLog.message(wrapTextForClack(state.output));
    },
    update: (state: Task) => {
      taskLog.message(wrapTextForClack(state.output || state.title));
    },
    succeed: (state: Task) => {
      taskLog.success(taskMessageFormatter(state));
    },
    fail: (state: Task) => {
      taskLog.error(wrapTextForClack(state.title), { showLog: false });
    },
  };
}

function taskMessageFormatter(state: Task) {
  const message = state.output ? state.title + '\n' + CLI_COLORS.muted(state.output) : state.title;
  return wrapTextForClack(message);
}
