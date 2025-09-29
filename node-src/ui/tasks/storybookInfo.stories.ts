import task from '../components/task';
import { initial, pending, success } from './storybookInfo';

export default {
  title: 'CLI/Tasks/StorybookInfo',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const storybook = {
  version: '5.3.0',
  builder: { name: 'webpack4', packageVersion: '5.3.0' },
  addons: [],
};
const addons = [{ name: 'actions' }, { name: 'docs' }, { name: 'design-assets' }];

const ctx = { options: {} } as any;

export const Initial = () => initial(ctx);

export const Pending = () => pending(ctx);

export const Success = () => success({ ...ctx, storybook } as any);

export const WithAddons = () => success({ ...ctx, storybook: { ...storybook, addons } } as any);
