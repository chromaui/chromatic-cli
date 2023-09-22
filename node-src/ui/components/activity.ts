import { activityBar } from '../../lib/utils';
import { Context, Task } from '../../types';

const renderLoop = (ctx: Context, render: (frame: number) => void) => {
  const interval = ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL;
  const maxFrames = ctx.env.CHROMATIC_TIMEOUT / interval;

  let timeout: NodeJS.Timeout;
  const tick = (frame = 0) => {
    render(frame);
    if (frame < maxFrames) {
      timeout = setTimeout(() => tick(frame + 1), interval);
    }
  };

  tick();
  return {
    end: () => clearTimeout(timeout),
  };
};

export const startActivity = async (ctx: Context, task: Task) => {
  if (ctx.options.interactive) return;
  ctx.activity = renderLoop(ctx, (n) => {
    task.output = activityBar(n);
  });
};

export const endActivity = async (ctx: Context) => {
  if (ctx.activity) ctx.activity.end();
};
