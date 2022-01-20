import runtimeError from './runtimeError';

export default {
  title: 'CLI/Messages/Errors',
};

const stacktrace = `Error: Oh no!
    at MyComponent (http://localhost:9009/main.6eda3407d6f38d88bd8d.bundle.js:2068:24)
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1554:16
    at http://localhost:9009/main.6eda3407d6f38d88bd8d.bundle.js:110:66
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1553:14
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1554:16
    at withSubscriptionTracking (http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1582:16)
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1553:14`;

const error = (message: string, stack?: string) => {
  const err = new Error(message);
  if (stack) err.stack = stack;
  return err;
};

export const RuntimeError = () =>
  runtimeError({ options: {} as any, runtimeErrors: [error('Oh no!', stacktrace)] });

export const RuntimeErrorSimple = () =>
  runtimeError({ options: {} as any, runtimeErrors: [error('Oh no!')] });

export const RuntimeWarning = () =>
  runtimeError({ options: {} as any, runtimeWarnings: [error('Oops!', stacktrace)] });

export const AllowRuntimeError = () =>
  runtimeError({
    runtimeErrors: [error('Oh no!', stacktrace)],
    options: { allowConsoleErrors: true } as any,
  });
