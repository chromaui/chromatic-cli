import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Generate build report',
};

export const pending = () => ({
  status: 'pending',
  title: 'Generating build report',
  output: `Collecting build information`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Generated build report`,
  output: `View report at ${ctx.reportPath}`,
});
