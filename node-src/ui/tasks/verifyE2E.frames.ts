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

// Node-side scenarios for the verify task on an E2E project, where the task reports on the "test
// suite" rather than "Storybook". Same state functions as `verify.frames.ts`, different `ctx.options`.

const ctx = { options: { playwright: true } } as any;

const build = {
  number: 42,
  webUrl: 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42',
  app: { setupUrl: 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57' },
};

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

const update = (output: string) =>
  make({ status: 'updating', title: pending(ctx).title, output }, pending(ctx));

export const Pending = () => make(pending(ctx));

export const RunOnlyChangedFiles = () =>
  update(
    runOnlyFiles({
      ...ctx,
      onlyStoryFiles: Array.from({ length: 12 }),
      options: ctx.options,
    } as any).output
  );

export const RunOnlyFiles = () =>
  update(
    runOnlyFiles({
      ...ctx,
      options: { ...ctx.options, onlyStoryFiles: ['./src/**/*.stories.js'] },
    } as any).output
  );

export const RunOnlyNames = () =>
  update(
    runOnlyNames({ ...ctx, options: { ...ctx.options, onlyStoryNames: ['MyComponent/**'] } } as any)
      .output
  );

export const AwaitingUpgrades = () =>
  update(awaitingUpgrades(ctx, [{ completedAt: 123 }, { completedAt: null }]).output);

export const Started = () => make(success({ ...ctx, build } as any), pending(ctx));

export const Published = () =>
  make(success({ ...ctx, isPublishOnly: true, build } as any), pending(ctx));

export const ContinueSetup = () =>
  make(success({ ...ctx, isOnboarding: true, build } as any), pending(ctx));

export const DryRun = () => make(dryRun(ctx), pending(ctx));

export const Failed = () =>
  make(
    fallbackFailureState(pending(ctx).title, new Error(publishFailed(ctx).output)),
    pending(ctx)
  );
