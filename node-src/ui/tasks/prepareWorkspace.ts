import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Prepare workspace',
};

export const pending = () => ({
  status: 'pending',
  title: 'Preparing your workspace',
  output: `Ensuring your git workspace is clean and up-to-date`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Prepared your workspace`,
  output: `Checked out commit '${ctx.mergeBase?.slice(0, 7)}' on '${ctx.options.patchBaseRef}'`,
});
