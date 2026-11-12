import task from '../components/task';
import { pending, success } from './restoreWorkspace';

export default {
  title: 'CLI/Tasks/RestoreWorkspace',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

export const Pending = () => pending();
export const Success = () => success();
