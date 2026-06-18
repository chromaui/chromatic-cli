import { fallbackFailureState } from '../../renderer/engine';
import { clackSpinnerRenderer } from '../../renderer/engine/clack/spinnerRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import { pending, skipped, success } from './build';

// Node-side scenarios for the build task in an E2E project, where the task reports on the "test
// suite" rather than "Storybook". Same state functions as `build.frames.ts`, different `ctx.options`.

const ctx = { options: { playwright: true } } as any;
const buildCommand = 'yarn build-archive-storybook';

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

export const BuildingStart = () => make(pending(ctx));

export const Building = () =>
  make(
    { status: 'updating', title: pending(ctx).title, output: `Running command: ${buildCommand}` },
    pending(ctx)
  );

export const Built = () =>
  make(
    success({
      ...ctx,
      now: 0,
      startedAt: -32_100,
      buildLogFile: '/users/me/project/build-archive.log',
    }),
    pending(ctx)
  );

export const Skipped = () =>
  make(
    skipped({
      ...ctx,
      options: { ...ctx.options, storybookBuildDir: '/users/me/project/archive-static' },
    }),
    pending(ctx)
  );

export const Failed = () =>
  make(
    fallbackFailureState(pending(ctx).title, new Error(`Command failed: ${buildCommand}`)),
    pending(ctx)
  );
