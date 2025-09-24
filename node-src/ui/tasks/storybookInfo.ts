import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';
import { buildType } from './utils';

const capitalize = (string: string) =>
  string
    .split('-')
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1))
    .join(' ');

const e2eMessage = (ctx: Context) => {
  if (ctx.options.playwright) {
    return 'Playwright for E2E';
  }

  if (ctx.options.cypress) {
    return 'Cypress for E2E';
  }

  return 'E2E';
};

const infoMessage = (ctx: Context) => {
  if (isE2EBuild(ctx.options)) {
    return e2eMessage(ctx);
  }

  const { addons, version, builder } = ctx.storybook;
  const info = version ? `Storybook ${version}` : '';
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
