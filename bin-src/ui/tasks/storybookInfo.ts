import { Context } from '../../types';

const capitalize = (string: string) =>
  string
    .split('-')
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    .join(' ');

const infoMessage = ({ addons, version, viewLayer, builder }: Context['storybook']) => {
  const info = version && viewLayer ? `Storybook ${version} for ${capitalize(viewLayer)}` : '';
  const builderInfo = builder
    ? `${info}; using the ${builder.name} builder (${builder.packageVersion})`
    : info;
  return addons?.length
    ? `${builderInfo}; supported addons found: ${addons
        .map((addon) => capitalize(addon.name))
        .join(', ')}`
    : `${builderInfo}; no supported addons found`;
};

export const initial = {
  status: 'initial',
  title: 'Collect Storybook metadata',
};

export const pending = () => ({
  status: 'pending',
  title: 'Collecting Storybook metadata',
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: 'Collected Storybook metadata',
  output: infoMessage(ctx.storybook),
});
