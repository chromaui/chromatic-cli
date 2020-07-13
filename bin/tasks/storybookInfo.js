import getStorybookInfo from '../lib/getStorybookInfo';
import { createTask, transitionTo } from '../lib/tasks';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

export const setStorybookInfo = async ctx => {
  const { version, viewLayer, addons } = await getStorybookInfo(ctx);
  ctx.storybook = { version, viewLayer, addons };
};

export default createTask({
  title: initial.title,
  skip: ctx => ctx.skip,
  steps: [transitionTo(pending), setStorybookInfo, transitionTo(success, true)],
});
