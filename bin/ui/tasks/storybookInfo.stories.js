import task from '../components/task';
import { initial, pending, success } from './storybookInfo';

export default {
  title: 'CLI/Tasks/StorybookInfo',
  decorators: [(storyFn) => task(storyFn())],
};

const storybook = { version: '5.3.0', viewLayer: 'web-components' };

export const Initial = () => initial;

export const Pending = () => pending();

export const Success = () => success({ storybook });
