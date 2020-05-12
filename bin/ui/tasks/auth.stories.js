import task from '../components/task';
import { initial, authenticating, authenticated, invalidToken } from './auth';

export default {
  title: 'CLI/Tasks/Auth',
  decorators: [storyFn => task(storyFn())],
};

const indexUrl = 'https://index.chromatic.com';
const projectToken = '3cm6b49xnld';

export const Initial = () => initial;
export const Authenticating = () => authenticating({ options: { indexUrl } });
export const Authenticated = () => authenticated({ options: { projectToken } });
export const InvalidToken = () => invalidToken({ options: { projectToken } });
