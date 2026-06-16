import frames from './spinner.frames?clack';

export default {
  title: 'CLI/Renderers/Spinner',
};

export const Start = () => frames.Start;
export const InProgress = () => frames.InProgress;
export const Success = () => frames.Success;
export const Failure = () => frames.Failure;
