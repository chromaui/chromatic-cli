import { createTask, transitionTo } from '../lib/tasks';
import getInfo from '../storybook/get-info';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

const setStorybookInfo = async ctx => {
  const { version, viewLayer, addons } = await getInfo();
  ctx.storybook = { version, viewLayer, addons };
};

export default createTask({
  title: initial.title,
  steps: [transitionTo(pending), setStorybookInfo, transitionTo(success, true)],
});
