import { Context } from '../../types';
import { broadcastRenderer } from './broadcast';
import { TaskRenderer } from './index';
import { logRenderer } from './logRenderer/renderer';

/**
 * Assemble the composed `TaskRenderer` for a task.
 *
 * Interactive runs render through the task's interactive renderer plus a file-only
 * `logRenderer`. Non-interactive runs render through a single `logRenderer` writing to `ctx.log.info`.
 * The logger itself handles branching the logs to the log file when enabled.
 *
 * The result is always wrapped in `broadcastRenderer` so a renderer hook throwing is logged to the
 * log file rather than crashing the task.
 *
 * @param ctx The CLI context, narrowed to options and log.
 * @param makeInteractiveRenderer Factory for the task's interactive renderer.
 *
 * @returns A single composed `TaskRenderer`.
 */
export function getRenderer(
  ctx: Pick<Context, 'options' | 'log'>,
  makeInteractiveRenderer: () => TaskRenderer
): TaskRenderer {
  const reportError = (error: unknown, hook: keyof TaskRenderer) =>
    ctx.log.file(`renderer ${hook} hook threw`, error);

  const renderers = ctx.options.interactive
    ? [makeInteractiveRenderer(), logRenderer(ctx.log.file)]
    : [logRenderer(ctx.log.info)];

  return broadcastRenderer(renderers, reportError);
}
