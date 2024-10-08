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

    for (const step of steps) {
      ctx.options.experimental_abortSignal?.throwIfAborted();
      await step(ctx, task);
    }

    ctx.options.experimental_onTaskComplete?.({ ...ctx });
  },
  ...config,
});

export const setTitle =
  (title: ValueFunction, subtitle?: ValueFunction) => (ctx: Context, task: Task) => {
    const ttl = typeof title === 'function' ? title(ctx, task) : title;
    const sub = typeof subtitle === 'function' ? subtitle(ctx, task) : subtitle;
    task.title = sub ? `${ttl}\n${chalk.dim(`    → ${sub}`)}` : ttl;
  };

export const setOutput = (output: ValueFunction) => (ctx: Context, task: Task) => {
  task.output = typeof output === 'function' ? output(ctx, task) : output;
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
