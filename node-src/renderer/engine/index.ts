// NOTE: buildDeps currently lives in lib/tasks.ts (the Listr engine). It isn't Listr-specific —
// it just projects Context into Deps — so when Listr is deleted it should move here. Leaving it
// alone for now to avoid a noisy diff.
import { buildDeps } from '@cli/tasks';

import { Context, Deps, Task, TaskFunction, TaskName, TaskReporter, TaskResult } from '../../types';

/**
 * A `TaskRenderer` consumes the `Task` state objects emitted by a task's
 * lifecycle (defined in `ui/tasks/*`) and updates the underlying UI accordingly.
 *
 * Implementations should assume one `start` call, zero or more `update` calls, and one `succeed` or
 * `fail` call.
 */
export interface TaskRenderer {
  /** Task has begun. `state` is the `pending` transition. */
  start: (state: Task) => void;
  /**
   * Progress update while the task body runs, pushed via `deps.report`. `state.output` carries the
   * message; `state.progress` carries optional numeric progress for renderers that draw a bar.
   */
  update: (state: Task) => void;
  /** Task finished successfully. `state` is the `success` or `partial` transition. */
  succeed: (state: Task) => void;
  /** Task threw. `state.title` is a short failure headline; `state.output` is the error body. */
  fail: (state: Task) => void;
}

/**
 * Renderer-agnostic task configuration. `TaskRenderer` implementations are responsible for renderer-specific
 * UI behavior.
 *
 * `transitions` are the ctx -> Task functions from `ui/tasks/*`.
 * `extractInput` / `run` / `applyOutput` are the business-logic hooks defined in `tasks/*`.
 */
export interface TaskConfig<TInput, TOutput, TPartial = never> {
  name: TaskName;
  title: string;
  transitions: {
    pending: (ctx: Context) => Task;
    success: (ctx: Context) => Task;
    partial?: (ctx: Context, partial: TPartial) => Task;
    failure?: (ctx: Context, error: Error) => Task;
  };
  extractInput: (ctx: Context) => TInput;
  run: TaskFunction<TInput, TOutput, Deps, TPartial>;
  applyOutput?: (ctx: Context, output: TOutput) => void | Promise<void>;
  applyPartial?: (ctx: Context, partial: TPartial) => void | Promise<void>;
}

/**
 * Run a single task to completion, driving the supplied `TaskRenderer` through its lifecycle.
 *
 * @param ctx The CLI context (mutated: task, startedAt, title, skip).
 * @param config The task configuration.
 * @param renderer The presentation adapter.
 *
 * @returns A promise that resolves when the task completes (rejects, after `renderer.fail`, on error).
 */
export async function runTask<TInput, TOutput, TPartial = never>(
  ctx: Context,
  config: TaskConfig<TInput, TOutput, TPartial>,
  renderer: TaskRenderer
): Promise<void> {
  // An upstream task decided to short-circuit the pipeline, so downstream tasks bail
  if (ctx.skip) {
    ctx.log.debug(`Skipping task '${config.name}' due to upstream skip`);
    return;
  }

  ctx.task = config.name;
  ctx.title = config.title;
  ctx.startedAt = Number.isInteger(ctx.now) ? (ctx.now as number) : Date.now();
  ctx.options.experimental_abortSignal?.throwIfAborted();
  ctx.options.experimental_onTaskStart?.({ ...ctx });

  const pending = config.transitions.pending(ctx);
  renderer.start(pending);

  try {
    const input = config.extractInput(ctx);
    const deps = { ...buildDeps(ctx), report: makeReporter(ctx, renderer) };
    const result = await config.run(deps, input);
    await applyResult(ctx, config, result, renderer);
  } catch (error) {
    renderer.fail(failureState(ctx, config, error as Error, pending.title));
    throw error;
  }

  ctx.options.experimental_onTaskComplete?.({ ...ctx });
}

/**
 * Build the reporter injected as `deps.report`, used to enable mid-task UI updates through the
 * renderer's `update` hook. These updates are also fanned out to `experimental_onTaskProgress`
 * (this callback only accepts numeric progress, not textual updates).
 *
 * @param ctx The CLI context (its `title` is updated when a textual update arrives).
 * @param renderer The active renderer for the running task.
 *
 * @returns A `TaskReporter` closed over the current task's renderer.
 */
function makeReporter(ctx: Context, renderer: TaskRenderer): TaskReporter {
  return (update) => {
    if (update.title !== undefined) ctx.title = update.title;

    renderer.update({
      title: ctx.title,
      output: update.output,
      progress: update.progress,
    });

    if (update.progress) {
      ctx.options.experimental_onTaskProgress?.({ ...ctx }, update.progress);
    }
  };
}

/**
 * Maps task results to context mutations and UI state objects, as well as calling the underlying renderer to
 * drive the UI.
 *
 * @param ctx The CLI context (mutated: title, skip).
 * @param config The task configuration supplying transitions and apply hooks.
 * @param result The result of the called task.
 * @param renderer The renderer to drive.
 */
async function applyResult<TInput, TOutput, TPartial>(
  ctx: Context,
  config: TaskConfig<TInput, TOutput, TPartial>,
  result: TaskResult<TOutput, TPartial>,
  renderer: TaskRenderer
): Promise<void> {
  switch (result.kind) {
    case 'continue': {
      await config.applyOutput?.(ctx, result.output);
      const success = config.transitions.success(ctx);
      ctx.title = success.title;
      renderer.succeed(success);
      return;
    }
    case 'partial': {
      await config.applyPartial?.(ctx, result.output);
      // A `partial` result means "we did some work, but we're stopping the pipeline early" (e.g. a
      // rebuild that found nothing to do). Fall back to the success copy if no `partial` transition
      // is provided, since from the user's perspective the task didn't fail.
      const partial =
        config.transitions.partial?.(ctx, result.output) ?? config.transitions.success(ctx);
      ctx.title = partial.title;
      renderer.succeed(partial);
      ctx.skip = true;
      return;
    }
    case 'skip': {
      // Note we're using the pending transition here. The task succeeded, hence the `renderer.success` call,
      // but didn't complete, so the messaging reflects pending.
      renderer.succeed(config.transitions.pending(ctx));
      ctx.skip = true;
      return;
    }
    default:
      result satisfies never;
  }
}

/**
 * Derive the `Task` state for a failure. Prefers an explicit `failure` transition from
 * `ui/tasks/*`; otherwise builds a fallback from the pending title.
 *
 * @param ctx The CLI context (its current `title` provides the fallback headline).
 * @param config The task configuration, used for an explicit `failure` transition.
 * @param error The thrown error whose message becomes the failure body.
 * @param pendingTitle The title of the pending task.
 *
 * @returns The `Task` state describing the failure for the renderer.
 */
function failureState<TInput, TOutput, TPartial>(
  ctx: Context,
  config: TaskConfig<TInput, TOutput, TPartial>,
  error: Error,
  pendingTitle: string
): Task {
  return config.transitions.failure?.(ctx, error) ?? fallbackFailureState(pendingTitle, error);
}

/**
 * The failure state `runTask` derives when a task supplies no explicit `failure` transition.
 * Exported so Storybook frames can render the exact state the runtime would produce.
 *
 * @param pendingTitle The title of the task's `pending` transition.
 * @param error The thrown error whose message becomes the failure body.
 *
 * @returns The `Task` state describing the failure for the renderer.
 */
export function fallbackFailureState(pendingTitle: string, error: Error): Task {
  return {
    status: 'error',
    title: `${pendingTitle} failed`,
    output: error.message,
  };
}
