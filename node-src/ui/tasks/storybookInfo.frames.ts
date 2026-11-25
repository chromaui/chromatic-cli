import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import { pending, success } from './storybookInfo';

// Node-side scenarios for the storybookInfo task. The `?clack` Vite plugin runs this module in
// Node, renders each export through the real Clack renderer, and hands the resulting ANSI strings
// to the browser story (`storybookInfo.stories.ts`).

const ctx = { options: {} };

export const Pending = () => captureTask(pending(ctx as any));

export const Success = () => captureTask(success(ctx as any));

// A missing build script logs its own message, so the task's failure body is only the short
// `TaskFailure` message setStorybookInfo throws.
export const Failed = () =>
  captureTask(
    fallbackFailureState(
      pending(ctx as any).title,
      new Error('Build script "build-storybook" not found in package.json')
    )
  );
