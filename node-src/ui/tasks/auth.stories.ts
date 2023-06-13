import task from '../components/task';
import { authenticated, authenticating, initial, invalidToken } from './auth';

export default {
  title: 'CLI/Tasks/Auth',
  decorators: [(storyFn: any) => task(storyFn())],
};

const env = { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' };
const options = { projectToken: '3cm6b49xnld' };

export const Initial = () => initial;
export const Authenticating = () => authenticating({ env } as any);
export const Authenticated = () => authenticated({ env, options } as any);
export const InvalidToken = () => invalidToken({ env, options } as any);
