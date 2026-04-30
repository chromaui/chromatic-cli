import task from '../components/task';
import { initial, pending, success } from './storybookInfo';

export default {
  title: 'CLI/Tasks/StorybookInfo/E2E',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const ctx = { options: { playwright: true } } as any;

export const Initial = () => initial(ctx);

export const Pending = () => pending(ctx);

export const Success = () => success(ctx);
