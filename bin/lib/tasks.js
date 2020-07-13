import chalk from 'chalk';
import pluralize from 'pluralize';

export const createTask = ({ steps, ...config }) => ({
  ...config,
  task: async (ctx, task) => {
    ctx.title = config.title;
    ctx.task = task;
    ctx.startedAt = Number.isInteger(ctx.now) ? ctx.now : new Date();
    // eslint-disable-next-line no-restricted-syntax
    for (const step of steps) {
      // eslint-disable-next-line no-await-in-loop
      await step(ctx, task);
    }
  },
});

export const setTitle = (title, subtitle) => (ctx, task) => {
  const ttl = typeof title === 'function' ? title(ctx, task) : title;
  const sub = typeof subtitle === 'function' ? subtitle(ctx, task) : subtitle;
  // eslint-disable-next-line no-param-reassign
  task.title = sub ? `${ttl}\n${chalk.dim(`    → ${sub}`)}` : ttl;
};

export const setOutput = output => (ctx, task) => {
  // eslint-disable-next-line no-param-reassign
  task.output = typeof output === 'function' ? output(ctx, task) : output;
};

export const transitionTo = (stateFn, last) => (ctx, task) => {
  const { title, output } = stateFn(ctx);
  setTitle(title, last ? output : undefined)(ctx, task);
  if (!last && output) setOutput(output)(ctx, task);
};

export const getDuration = ctx => {
  const now = Number.isInteger(ctx.now) ? ctx.now : new Date();
  const duration = Math.round((now - ctx.startedAt) / 1000);
  const seconds = pluralize('second', Math.floor(duration % 60), true);
  if (duration < 60) return seconds;
  const minutes = pluralize('minute', Math.floor(duration / 60), true);
  if (duration % 60) return `${minutes} ${seconds}`;
  return minutes;
};
