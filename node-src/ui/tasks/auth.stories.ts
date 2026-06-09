import frames from './auth.frames?clack';

export default {
  title: 'CLI/Tasks/Auth',
};

export const Authenticating = () => frames.Authenticating;
export const Authenticated = () => frames.Authenticated;
export const InvalidToken = () => frames.InvalidToken;
