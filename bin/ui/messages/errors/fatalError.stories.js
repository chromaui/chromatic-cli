import fatalError from './fatalError';

export default {
  title: 'CLI/Messages/Errors',
};

const pkg = {
  name: 'chromatic',
  version: '4.0.3',
  description: 'Visual Testing for Storybook',
  homepage: 'https://www.chromatic.com',
  docs: 'https://www.chromatic.com/docs/',
  bugs: {
    url: 'https://github.com/chromaui/chromatic-cli',
    email: 'support@chromatic.com',
  },
};

const stack = `Error: Oh no!
    at FatalError (http://localhost:9009/main.6eda3407d6f38d88bd8d.bundle.js:2068:24)
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1554:16
    at http://localhost:9009/main.6eda3407d6f38d88bd8d.bundle.js:110:66
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1553:14
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1554:16
    at withSubscriptionTracking (http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1582:16)
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:251:21
    at http://localhost:9009/vendors~main.6eda3407d6f38d88bd8d.bundle.js:1553:14`;

const timestamp = '2020-05-12T15:06:30.553Z';

export const FatalError = () => {
  const context = { title: 'Run a job', pkg };
  const error = { message: "That's not right!", stack };
  return fatalError(context, error, timestamp);
};

export const FatalErrorSimple = () => {
  const context = { title: 'Run a job', pkg };
  const error = { message: "That's not right!" };
  return fatalError(context, error, timestamp);
};
