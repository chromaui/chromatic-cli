const capitalize = (string) =>
  string
    .split('-')
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    .join(' ');

const infoMessage = ({ version, viewLayer }) =>
  `Storybook v${version} for ${capitalize(viewLayer)}`;

export const initial = {
  status: 'initial',
  title: 'Collect Storybook metadata',
};

export const pending = (ctx) => ({
  status: 'pending',
  title: 'Collecting Storybook metadata',
});

export const success = (ctx) => ({
  status: 'success',
  title: 'Collected Storybook metadata',
  output: infoMessage(ctx.storybook),
});
