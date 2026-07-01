import { Task } from '../../../types';
import { captureTask } from '../../storybook/captureTask';
import { clackProgressBarRenderer } from './progressRenderer';

// Node-side proof-of-concept scenarios for the progress-bar renderer. The `?clack` Vite plugin runs
// this module in Node, renders each export through the real Clack progress bar, and hands the
// resulting ANSI strings to the browser story (`progressBar.stories.ts`). These use synthetic
// `Task` states — real upload/snapshot stories arrive when those tasks migrate.

const make = (state: Task, starting?: Task) =>
  captureTask(state, starting, clackProgressBarRenderer);

const starting: Task = { status: 'pending', title: 'Uploading', output: '0%' };

// pending → drive calls start() only; the title sits in the task-log header and one fake tick
// renders the 0% bar beneath it.
export const Start = () => make({ status: 'pending', title: 'Uploading' });

// updating → drive calls start(starting) then update(); one fake tick renders the bar at ~53% fill.
export const InProgress = () =>
  make(
    {
      status: 'updating',
      title: 'Uploading',
      output: '4.2/8.0 MB',
      progress: { progress: 4.2 * 1024 * 1024, total: 8 * 1024 * 1024, unit: 'bytes' },
    },
    starting
  );

// success → drive calls start(starting) then succeed(); clear() removes the bar and closing the
// task log collapses the header into the success line.
export const Success = () =>
  make(
    { status: 'success', title: 'Publish complete', output: 'Uploaded 5 files (8.0 MB)' },
    starting
  );

// failure -> drive calls start(starting) then fail(); clear() removes the bar and closing the task
// log collapses the header into the failure line.
export const Failure = () => make({ status: 'error', title: 'Publish failed' }, starting);
