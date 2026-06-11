import { captureTask } from '../../renderer/storybook/captureTask';
import { pending, success } from './storybookInfo';

// Node-side scenarios for the storybookInfo task. The `?clack` Vite plugin runs this module in
// Node, renders each export through the real Clack renderer, and hands the resulting ANSI strings
// to the browser story (`storybookInfo.stories.ts`).

const ctx = { options: {} };

export const Pending = () => captureTask(pending(ctx as any));

export const Success = () => captureTask(success(ctx as any));
