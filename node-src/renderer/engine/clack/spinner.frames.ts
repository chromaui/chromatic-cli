import { Task } from '../../../types';
import { captureTask } from '../../storybook/captureTask';
import { clackSpinnerRenderer } from './spinnerRenderer';

// Node-side proof-of-concept scenarios for the spinner renderer. The `?clack` Vite plugin runs this
// module in Node, renders each export through the real Clack spinner, and hands the resulting ANSI
// strings to the browser story (`spinner.stories.ts`).

const make = (state: Task, starting?: Task) => captureTask(state, starting, clackSpinnerRenderer);

const starting: Task = { status: 'pending', title: 'Building Storybook' };

// pending → drive calls start() only; one fake tick renders the spinner labeled with the title.
export const Start = () => make({ status: 'pending', title: 'Building Storybook' });

// updating → drive calls start(starting) then update(); one fake tick renders the spinner relabeled.
export const InProgress = () =>
  make(
    { status: 'updating', title: 'Building Storybook', output: 'Compiling 42 modules' },
    starting
  );

// success → drive calls start(starting) then succeed(); clear() removes the spinner and
// log.success() writes the success line.
export const Success = () =>
  make({ status: 'success', title: 'Build complete', output: 'Built 42 stories' }, starting);

// failure → drive calls start(starting) then fail(); clear() removes the spinner and log.error()
// writes the failure line.
export const Failure = () => make({ status: 'error', title: 'Build failed' }, starting);
