import { activityBar } from '../../lib/utils';
import { Context, Task } from '../../types';

const renderLoop = (ctx: Context, render: (frame: number) => void) => {
  const interval = ctx.options.interactive ? 100 : ctx.env.CHROMATIC_OUTPUT_INTERVAL;
  const maxFrames = ctx.env.CHROMATIC_TIMEOUT / interval;
  let done = false;
  const tick = (frame = 0) => {
    render(frame);
    if (!done && frame < maxFrames) {
      setTimeout(() => tick(frame + 1), interval);
    }
  };
  tick();
  return {
    end() {
      done = true;
    },
  };
};

export const startActivity = async (ctx: Context, task: Task) => {
  if (ctx.options.interactive) return;
  ctx.activity = renderLoop(ctx, (n) => {
    // eslint-disable-next-line no-param-reassign
    task.output = activityBar(n);
  });
};

export const endActivity = async (ctx: Context) => {
  if (ctx.activity) ctx.activity.end();
};
