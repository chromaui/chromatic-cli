import { fallbackFailureState } from '../../renderer/engine';
import { clackSpinnerRenderer } from '../../renderer/engine/clack/spinnerRenderer';
import { captureTask } from '../../renderer/storybook/captureTask';
import { Task } from '../../types';
import { pending, skipped, success } from './build';

// Node-side scenarios for the build task. The `?clack` Vite plugin runs this module in Node, renders
// each export through the real Clack spinner renderer (build wires the spinner, not the task log),
// and hands the resulting ANSI strings to the browser story (`build.stories.ts`).

const ctx = { options: {} } as any;
const buildCommand = 'yarn run build-storybook -o storybook-static';

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

export const BuildingStart = () => make(pending(ctx));

// The build command isn't known until the task body computes it, then reports it mid-run via
// `deps.report`, so the running frame is an update over the started spinner.
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
      buildLogFile: '/users/me/project/build-storybook.log',
    }),
    pending(ctx)
  );

export const Skipped = () =>
  make(
    skipped({
      ...ctx,
      options: { ...ctx.options, storybookBuildDir: '/users/me/project/storybook-static' },
    }),
    pending(ctx)
  );

// build registers no `failure` transition, so a build failure renders the engine's fallback failure
// state, built from the pending title and the `Command failed` message buildStorybook throws.
export const Failed = () =>
  make(
    fallbackFailureState(pending(ctx).title, new Error(`Command failed: ${buildCommand}`)),
    pending(ctx)
  );
