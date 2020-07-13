import task from '../components/task';
import { initial, pending, success } from './report';

export default {
  title: 'CLI/Tasks/Report',
  decorators: [storyFn => task(storyFn())],
};

export const Initial = () => initial;

export const Pending = () => pending();

export const Success = () => success({ reportPath: './chromatic-test-report.xml' });
