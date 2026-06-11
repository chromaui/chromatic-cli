import { fallbackFailureState } from '../../renderer/engine';
import { captureTask } from '../../renderer/storybook/captureTask';
import missingBuildScriptName from '../messages/errors/missingBuildScriptName';
import { pending, success } from './storybookInfo';

// Node-side scenarios for the storybookInfo task. The `?clack` Vite plugin runs this module in
// Node, renders each export through the real Clack renderer, and hands the resulting ANSI strings
// to the browser story (`storybookInfo.stories.ts`).

const ctx = { options: {} };

export const Pending = () => captureTask(pending(ctx as any));

export const Success = () => captureTask(success(ctx as any));

export const Failed = () =>
  captureTask(
    fallbackFailureState(
      pending(ctx as any).title,
      new Error(missingBuildScriptName('build-storybook'))
    )
  );
