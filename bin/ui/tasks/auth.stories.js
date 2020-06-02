import task from '../components/task';
import { authenticated, authenticating, initial, invalidToken } from './auth';

export default {
  title: 'CLI/Tasks/Auth',
  decorators: [storyFn => task(storyFn())],
};

const CHROMATIC_INDEX_URL = 'https://index.chromatic.com';
const projectToken = '3cm6b49xnld';

export const Initial = () => initial;
export const Authenticating = () => authenticating({ env: { CHROMATIC_INDEX_URL } });
export const Authenticated = () => authenticated({ options: { projectToken } });
export const InvalidToken = () => invalidToken({ options: { projectToken } });
