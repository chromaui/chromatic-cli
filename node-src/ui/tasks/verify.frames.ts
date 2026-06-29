/* eslint-disable unicorn/no-null -- GraphQL returns `null` if a value doesn't exist */
import { fallbackFailureState } from '../../renderer/engine';
import { clackSpinnerRenderer } from '../../renderer/engine/clack/spinnerRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import {
  awaitingUpgrades,
  dryRun,
  pending,
  publishFailed,
  runOnlyFiles,
  runOnlyNames,
  success,
} from './verify';

// Node-side scenarios for the verify task. The `?clack` Vite plugin runs this module in Node,
// renders each export through the real Clack spinner renderer (verify wires the spinner while it
// polls for the build to start), and hands the ANSI strings to the browser story
// (`verify.stories.ts`).

const ctx = { options: {} } as any;

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

// verify reports mid-run progress (partial-build filters, awaiting upgrade builds) via `deps.report`,
// so those render as updates over the started spinner.
const update = (output: string) =>
  make({ status: 'updating', title: pending(ctx).title, output }, pending(ctx));

export const Pending = () => make(pending(ctx));

export const RunOnlyChangedFiles = () =>
  update(
    runOnlyFiles({ ...ctx, onlyStoryFiles: Array.from({ length: 12 }), options: {} } as any).output
  );

export const RunOnlyFiles = () =>
  update(
    runOnlyFiles({ ...ctx, options: { onlyStoryFiles: ['./src/**/*.stories.js'] } } as any).output
  );

export const RunOnlyNames = () =>
  update(runOnlyNames({ ...ctx, options: { onlyStoryNames: ['MyComponent/**'] } } as any).output);

export const AwaitingUpgrades = () =>
  update(awaitingUpgrades(ctx, [{ completedAt: 123 }, { completedAt: null }]).output);

export const Started = () => make(success({ ...ctx, build } as any), pending(ctx));

export const Published = () =>
  make(success({ ...ctx, isPublishOnly: true, build } as any), pending(ctx));

export const ContinueSetup = () =>
  make(success({ ...ctx, isOnboarding: true, build } as any), pending(ctx));

export const DryRun = () => make(dryRun(ctx), pending(ctx));

// verify registers no `failure` transition, so failures render the engine's fallback failure state
// (built from the pending title); the thrown error body goes to the log file, not the frame.
export const Failed = () =>
  make(
    fallbackFailureState(pending(ctx).title, new Error(publishFailed(ctx).output)),
    pending(ctx)
  );
