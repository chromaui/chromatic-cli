import { Context } from '../../types';

export const initial = {
  status: 'initial',
  title: 'Initialize build',
};

export const pending = () => ({
  status: 'pending',
  title: 'Initializing build',
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: 'Initialized build',
  output: `Build ${ctx.announcedBuild.number} initialized`,
});
