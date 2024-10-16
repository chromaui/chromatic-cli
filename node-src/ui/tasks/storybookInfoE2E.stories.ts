import task from '../components/task';
import { initial, pending, success } from './storybookInfo';

export default {
  title: 'CLI/Tasks/StorybookInfo/E2E',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const storybook = {
  version: '5.3.0',
  viewLayer: 'web-components',
  builder: { name: 'webpack4', packageVersion: '5.3.0' },
  addons: [],
};

const ctx = { options: { playwright: true } } as any;

export const Initial = () => initial(ctx);

export const Pending = () => pending(ctx);

export const SuccessPlaywright = () => success({ ...ctx, storybook } as any);

export const SuccessCypress = () =>
  success({
    ...ctx,
    options: { ...ctx.options, playwright: false, cypress: true },
    storybook,
  } as any);
