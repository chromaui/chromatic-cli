import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import { pending, success } from './storybookInfo';

// Node-side scenarios for the storybookInfo task in an E2E project, where the task reports on the
// "test suite" rather than "Storybook". See `storybookInfo.frames.ts`.

const ctx = { options: { playwright: true } };

export const Pending = () => captureTask(pending(ctx as any));

export const Success = () => captureTask(success(ctx as any));

export const Failed = () =>
  captureTask(
    fallbackFailureState(
      pending(ctx as any).title,
      new Error('Unexpected error collecting metadata')
    )
  );
