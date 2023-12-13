import fatalError from './fatalError';

export default {
  title: 'CLI/Messages/Errors',
};

const context = {
  sessionId: '452a4bfa-5f0f-45a9-bf02-cd0ba550472a',
  git: { version: '2.24.1 (Apple Git-126)' },
  pkg: {
    name: 'chromatic',
    version: '4.0.3',
    description: 'Visual Testing for Storybook',
    homepage: 'https://www.chromatic.com',
    docs: 'https://www.chromatic.com/docs/',
    bugs: {
      url: 'https://github.com/chromaui/chromatic-cli',
      email: 'support@chromatic.com',
    },
  },
  packageJson: {
    scripts: {
      'build:storybook': 'build-storybook -o dist/storybook',
    },
  },
  flags: {
    projectToken: 'asdf123',
    buildScriptName: 'build:storybook',
  },
  options: {
    buildScriptName: 'build:storybook',
    reportToken: 'thiswillberedacted',
  },
  extraOptions: {
    userToken:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },
  runtimeMetadata: {
    nodePlatform: 'darwin',
    nodeVersion: 'v18.12.1',
    packageManager: 'npm',
    packageManagerVersion: '8.19.2',
  },
  buildCommand: 'npm run build:storybook -- --output-dir /tmp/path/to/output',
  exitCode: 255,
  exitCodeKey: 'UNKNOWN_ERROR',
  build: {
    id: '5ec5069ae0d35e0022b6a9cc',
    number: 42,
    webUrl: 'https://www.chromatic.com/build?appId=5d67dc0374b2e300209c41e7&number=1400',
  },
  storybookUrl: 'https://pfkaemtlit.tunnel.chromaticqa.com/',
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
  const error = { name: 'SyntaxError', message: "That's not right!", stack };
  return fatalError(context as any, error, timestamp);
};

export const FatalErrorSimple = () => {
  const error = { name: 'SyntaxError', message: "That's not right!" };
  return fatalError(context as any, error, timestamp);
};
