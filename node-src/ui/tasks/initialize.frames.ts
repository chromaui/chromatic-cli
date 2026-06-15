import { captureTask } from '../../renderer/storybook/captureTask';
import { pending, success } from './initialize';

// Node-side scenarios for the initialize task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack renderer, and hands the resulting ANSI strings to the
// browser story (`initialize.stories.ts`).

const announcedBuild = { number: 42 };

export const Pending = () => captureTask(pending());

export const Success = () => captureTask(success({ announcedBuild } as any));
