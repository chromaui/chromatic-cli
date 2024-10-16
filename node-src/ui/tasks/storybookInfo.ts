import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';

const capitalize = (string: string) =>
  string
    .split('-')
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    .join(' ');

const infoMessage = (ctx: Context) => {
  if (isE2EBuild(ctx.options)) {
    return ctx.options.playwright ? 'Playwright for E2E' : 'Cypress for E2E';
  }

  const { addons, version, viewLayer, builder } = ctx.storybook;
  const info = version && viewLayer ? `Storybook ${version} for ${capitalize(viewLayer)}` : '';
  const builderInfo = builder
    ? `${info}; using the ${builder.name} builder (${builder.packageVersion})`
    : info;
  const supportedAddons = addons?.filter((addon) => addon?.name);
  return supportedAddons?.length
    ? `${builderInfo}; supported addons found: ${supportedAddons
        .map((addon) => capitalize(addon.name))
        .join(', ')}`
    : `${builderInfo}; no supported addons found`;
};

const buildType = (ctx: Context) => (isE2EBuild(ctx.options) ? 'test suite' : 'Storybook');

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Collect ${buildType(ctx)} metadata`,
});

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Collecting ${buildType(ctx)} metadata`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Collected ${buildType(ctx)} metadata`,
  output: infoMessage(ctx),
});
