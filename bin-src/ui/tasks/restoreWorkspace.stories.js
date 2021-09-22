import task from '../components/task';
import { initial, pending, success } from './restoreWorkspace';

export default {
  title: 'CLI/Tasks/RestoreWorkspace',
  decorators: [(storyFn) => task(storyFn())],
};

export const Initial = () => initial;
export const Pending = () => pending();
export const Success = () => success();
