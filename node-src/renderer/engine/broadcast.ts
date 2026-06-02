import { Task } from '../../types';
import { TaskRenderer } from './index';

/**
 * Compose multiple `TaskRenderer`s into one that fans every lifecycle hook out to all of them.
 *
 * Each renderer's hook is called in its own try/catch, so a renderer throwing can neither starve
 * its siblings nor propagate into `runTask`. A caught throw is surfaced via `onError`, which is
 * itself wrapped in a try/catch so that a throwing reporter is silently swallowed rather than
 * propagated.
 *
 * @param renderers The renderers to broadcast to.
 * @param onError Surfaces a renderer-internal throw. If it throws, the throw is swallowed.
 *
 * @returns A `TaskRenderer` that forwards each hook to every renderer.
 */
export function broadcastRenderer(
  renderers: TaskRenderer[],
  onError: (error: unknown, hook: keyof TaskRenderer) => void
): TaskRenderer {
  const each = (hook: keyof TaskRenderer) => (state: Task) => {
    for (const renderer of renderers) {
      try {
        renderer[hook](state);
      } catch (error) {
        try {
          onError(error, hook);
        } catch {
          // Swallow: a throwing error reporter must not break broadcasting.
        }
      }
    }
  };

  return {
    start: each('start'),
    update: each('update'),
    succeed: each('succeed'),
    fail: each('fail'),
  };
}
