import runtimeError from './runtimeError';

export default {
  title: 'CLI/Messages/Errors',
};

const stack = `Error: Oh no!
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

export const RuntimeError = () => {
  const runtimeErrors = [{ message: 'Oh no!', stack }];
  const context = { title: 'Verify the published Storybook', runtimeErrors };
  return runtimeError(context);
};

export const RuntimeErrorSimple = () => {
  const runtimeErrors = [{ message: 'Oh no!' }];
  const context = { title: 'Verify the published Storybook', runtimeErrors };
  return runtimeError(context);
};

export const RuntimeWarning = () => {
  const runtimeWarnings = [{ message: 'Oops!', stack }];
  const context = { title: 'Verify the published Storybook', runtimeWarnings };
  return runtimeError(context);
};

export const AllowRuntimeError = () => {
  const runtimeErrors = [{ message: 'Oh no!', stack }];
  const context = {
    title: 'Verify the published Storybook',
    runtimeErrors,
    options: { allowConsoleErrors: true },
  };
  return runtimeError(context);
};
