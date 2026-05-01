import chalk from 'chalk';
import Listr from 'listr';
import pluralize from 'pluralize';

import { Context, Deps, Task, TaskFunction, TaskName, TaskResult } from '../types';

type ValueFunction = string | ((ctx: Context, task: Task) => string);

type ListrTaskExtras = Pick<Listr.ListrTask<Context>, 'skip' | 'enabled'>;

type LegacyTaskConfig = ListrTaskExtras & {
  name: TaskName;
  title: string;
  steps: ((ctx: Context, task: Listr.ListrTaskWrapper<Context> | Task) => void | Promise<void>)[];
};

type AdaptedTaskConfig<TInput, TOutput, TPartial = never> = ListrTaskExtras & {
  name: TaskName;
  title: string;
  transitions?: {
    pending?: (ctx: Context) => Task;
    success?: (ctx: Context) => Task;
  };
  extractInput: (ctx: Context) => TInput;
  applyOutput?: (ctx: Context, output: TOutput) => void;
  applyPartial?: (ctx: Context, output: TPartial) => void;
  run: TaskFunction<TInput, TOutput, Deps, TPartial>;
};

const buildDeps = (ctx: Context): Deps => ({
  log: ctx.log,
  client: ctx.client,
  http: ctx.http,
  env: ctx.env,
  options: ctx.options,
  runtime: ctx.runtime,
  analytics: ctx.analytics,
  pkg: ctx.pkg,
  sessionId: ctx.sessionId,
  packageJson: ctx.packageJson,
});

function applyAdaptedResult<TInput, TOutput, TPartial>(
  config: AdaptedTaskConfig<TInput, TOutput, TPartial>,
  ctx: Context,
  listrTask: Listr.ListrTaskWrapper<Context>,
  result: TaskResult<TOutput, TPartial>
) {
  switch (result.kind) {
    case 'continue':
      config.applyOutput?.(ctx, result.output);
      if (config.transitions?.success)
        transitionTo(config.transitions.success, true)(ctx, listrTask);
      return;
    case 'partial':
      config.applyPartial?.(ctx, result.output);
      ctx.skip = true;
      return;
    case 'skip':
      ctx.skip = true;
      return;
    default:
      result satisfies never;
  }
}

async function runAdaptedTask<TInput, TOutput, TPartial>(
  config: AdaptedTaskConfig<TInput, TOutput, TPartial>,
  ctx: Context,
  listrTask: Listr.ListrTaskWrapper<Context>
) {
  ctx.options.experimental_abortSignal?.throwIfAborted();
  if (config.transitions?.pending) transitionTo(config.transitions.pending)(ctx, listrTask);
  const input = config.extractInput(ctx);
  const result = await config.run(buildDeps(ctx), input);
  applyAdaptedResult(config, ctx, listrTask, result);
}

async function runLegacyTask(
  config: LegacyTaskConfig,
  ctx: Context,
  listrTask: Listr.ListrTaskWrapper<Context>
) {
  for (const step of config.steps) {
    ctx.options.experimental_abortSignal?.throwIfAborted();
    await step(ctx, listrTask);
  }
}

/**
 * Creates a Listr task wrapper that supports two config shapes: a legacy `steps[]` shape
 * for unmigrated tasks, and a typed `(deps, input) => Promise<TaskResult<output>>` shape
 * (with `transitions` for UI title/output state changes) that decouples task bodies from
 * the Context god object.
 *
 * @param config Either a LegacyTaskConfig or an AdaptedTaskConfig.
 *
 * @returns A Listr.ListrTask suitable for inclusion in the pipeline.
 */
export function createTask<TInput, TOutput, TPartial = never>(
  config: AdaptedTaskConfig<TInput, TOutput, TPartial>
): Listr.ListrTask<Context>;
export function createTask(config: LegacyTaskConfig): Listr.ListrTask<Context>;
export function createTask<TInput, TOutput, TPartial = never>(
  config: LegacyTaskConfig | AdaptedTaskConfig<TInput, TOutput, TPartial>
): Listr.ListrTask<Context> {
  const { name, title, skip, enabled } = config;
  return {
    title,
    skip,
    enabled,
    task: async (ctx: Context, listrTask: Listr.ListrTaskWrapper<Context>) => {
      ctx.task = name;
      ctx.title = title;
      ctx.startedAt = Number.isInteger(ctx.now) ? ctx.now : Date.now();
      ctx.options.experimental_onTaskStart?.({ ...ctx });

      await ('run' in config
        ? runAdaptedTask(config, ctx, listrTask)
        : runLegacyTask(config, ctx, listrTask));

      ctx.options.experimental_onTaskComplete?.({ ...ctx });
    },
  };
}

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
