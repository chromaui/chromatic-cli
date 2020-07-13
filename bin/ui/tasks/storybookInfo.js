const capitalize = string =>
  string
    .split('-')
    .map(str => str.charAt(0).toUpperCase() + str.slice(1))
    .join(' ');

const infoMessage = ({ addons, version, viewLayer }) => {
  const info = `Storybook v${version} for ${capitalize(viewLayer)}`;
  return addons.length
    ? `${info}; supported addons found: ${addons.map(addon => capitalize(addon.name)).join(', ')}`
    : `${info}; no supported addons found`;
};

export const initial = {
  status: 'initial',
  title: 'Collect Storybook metadata',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Collecting Storybook metadata',
});

export const success = ctx => ({
  status: 'success',
  title: 'Collected Storybook metadata',
  output: infoMessage(ctx.storybook),
});
