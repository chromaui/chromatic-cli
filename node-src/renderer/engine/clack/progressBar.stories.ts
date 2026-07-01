import frames from './progressBar.frames?clack';

export default {
  title: 'CLI/Renderers/ProgressBar',
};

export const Start = () => frames.Start;
export const InProgress = () => frames.InProgress;
export const Success = () => frames.Success;
export const Failure = () => frames.Failure;
