import { captureTask } from '../../renderer/storybook/captureTask';
import { environment, options } from '../../renderer/storybook/fixtures';
import { authenticated, authenticating, invalidToken } from './auth';

// Node-side scenarios for the auth task. The `?clack` Vite plugin runs this module in Node, renders
// each export through the real Clack renderer, and hands the resulting ANSI strings to the browser
// story (`auth.stories.ts`).

export const Authenticating = () => captureTask(authenticating({ env: environment } as any));

export const Authenticated = () => captureTask(authenticated({ env: environment, options } as any));

export const InvalidToken = () => captureTask(invalidToken({ env: environment, options } as any));
