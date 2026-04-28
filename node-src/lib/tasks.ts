import chalk from 'chalk';
import Listr from 'listr';
import pluralize from 'pluralize';

import { Context, Task, TaskName } from '../types';

type ValueFunction = string | ((ctx: Context, task: Task) => string);

type TaskInput = Omit<Listr.ListrTask<Context>, 'task'> & {
  name: TaskName;
  steps: ((ctx: Context, task: Listr.ListrTaskWrapper<Context> | Task) => void | Promise<void>)[];
};

export const createTask = ({
  name,
  title,
  steps,
  ...config
}: TaskInput): Listr.ListrTask<Context> => ({
  title,
  task: async (ctx: Context, task: Listr.ListrTaskWrapper<Context>) => {
    ctx.task = name;
    ctx.title = title;
    ctx.startedAt = Number.isInteger(ctx.now) ? ctx.now : Date.now();

    ctx.options.experimental_onTaskStart?.({ ...ctx });

    const runSteps = async () => {
      for (const step of steps) {
        ctx.options.experimental_abortSignal?.throwIfAborted();
        await step(ctx, task);
      }
    };
    await (ctx.ports?.ui ? ctx.ports.ui.withTask(task, runSteps) : runSteps());

    ctx.options.experimental_onTaskComplete?.({ ...ctx });
  },
  ...config,
});

function resolveValue(value: ValueFunction | undefined, ctx: Context, task: Task) {
  if (value === undefined) return undefined;
  return typeof value === 'function' ? value(ctx, task) : value;
}

// Tests construct minimal Context literals without `ctx.ports`; fall back to
// writing through the supplied Listr `task` directly so those callsites keep
// working until they're individually migrated.
function emit(ctx: Context, task: Task, state: { title?: string; output?: string }) {
  if (ctx.ports?.ui) {
    ctx.ports.ui.taskUpdate(state);
    return;
  }
  if (state.title !== undefined && task) task.title = state.title;
  if (state.output !== undefined && task) task.output = state.output;
}

export const setTitle =
  (title: ValueFunction, subtitle?: ValueFunction) => (ctx: Context, task: Task) => {
    const ttl = resolveValue(title, ctx, task);
    const sub = resolveValue(subtitle, ctx, task);
    const formatted = sub ? `${ttl}\n${chalk.dim(`    → ${sub}`)}` : ttl;
    emit(ctx, task, { title: formatted });
  };

export const setOutput = (output: ValueFunction) => (ctx: Context, task: Task) => {
  const value = resolveValue(output, ctx, task);
  if (value !== undefined) emit(ctx, task, { output: value });
};

export const transitionTo =
  (stateFunction: (ctx: Context) => Task, last = false) =>
  (ctx: Context, task: Task) => {
    const { title, output } = stateFunction(ctx);
    setTitle(title, last ? output : undefined)(ctx, task);
    if (!last && output) setOutput(output)(ctx, task);
  };

export const getDuration = (ctx: Context) => {
  const now = (Number.isInteger(ctx.now) ? ctx.now : Date.now()) as number;
  const startedAt = ctx.startedAt || 0;
  const duration = Math.round((now - startedAt) / 1000);
  const seconds = pluralize('second', Math.floor(duration % 60), true);
  if (duration < 60) return seconds;
  const minutes = pluralize('minute', Math.floor(duration / 60), true);
  if (duration % 60) return `${minutes} ${seconds}`;
  return minutes;
};
