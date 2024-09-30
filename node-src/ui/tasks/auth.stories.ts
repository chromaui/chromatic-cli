import task from '../components/task';
import { authenticated, authenticating, initial, invalidToken } from './auth';

export default {
  title: 'CLI/Tasks/Auth',
  decorators: [(storyFunction: any) => task(storyFunction())],
};

const environment = { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' };
const options = { projectToken: '3cm6b49xnld' };

export const Initial = () => initial;
export const Authenticating = () => authenticating({ env: environment } as any);
export const Authenticated = () => authenticated({ env: environment, options } as any);
export const InvalidToken = () => invalidToken({ env: environment, options } as any);
