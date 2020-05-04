import { createTask, setTitle } from '../lib/tasks';
import getInfo from '../storybook/get-info';

const infoMessage = ({ addons, version, viewLayer }) => {
  const info = `Storybook v${version} for ${viewLayer}`;
  return addons.length
    ? `${info}; supported addons found: ${addons.map(addon => addon.name).join(', ')}`
    : `${info}; no supported addons found`;
};

const setStorybookInfo = async ctx => {
  const { version, viewLayer, addons } = await getInfo();
  ctx.storybook = { version, viewLayer, addons };
};

export default createTask({
  title: 'Collect Storybook metadata',
  steps: [
    setTitle('Collecting Storybook metadata'),
    setStorybookInfo,
    setTitle('Collected Storybook metadata', ctx => infoMessage(ctx.storybook)),
  ],
});
