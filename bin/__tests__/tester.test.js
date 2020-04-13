import { confirm } from 'node-ask';
import kill from 'tree-kill';

import { runTest } from '../tester';
import { version as packageVersion } from '../../package.json';
import startApp, { checkResponse } from '../storybook/start-app';
import openTunnel from '../lib/tunnel';
import getRuntimeSpecs from '../tester/runtimes';
import { uploadToS3 } from '../io/upload-to-s3';

let lastBuild;

const defaultOutput = {
  buildNumber: 1,
  changeCount: 1,
  componentCount: 1,
  errorCount: undefined,
  specCount: 1,
};

let mockBuildFeatures;
beforeEach(() => {
  mockBuildFeatures = {
    features: { uiTests: true, uiReview: true },
    wasLimited: false,
  };
});

jest.mock('node-fetch', () => async (url, { body } = {}) => ({
  ok: true,
  json: async () => {
    const { query, variables } = JSON.parse(body);

    if (query.match('TesterCreateAppTokenMutation')) {
      return {
        data: { createAppToken: 'token' },
      };
    }

    if (query.match('TesterCreateBuildMutation')) {
      lastBuild = variables;
      return {
        data: {
          createBuild: {
            number: 1,
            specCount: 1,
            componentCount: 1,
            webUrl: 'http://test.com',
            ...mockBuildFeatures,
            app: {
              account: {
                billingUrl: 'https://foo.bar',
                exceededThreshold: false,
                paymentRequired: false,
              },
            },
          },
        },
      };
    }

    if (query.match('TesterBuildQuery')) {
      return {
        data: {
          app: { build: { status: 'BUILD_PENDING', changeCount: 1 } },
        },
      };
    }

    throw new Error('Unknown Query');
  },
}));
jest.mock('tree-kill');
jest.mock('fs-extra', () => ({
  pathExists: async () => true,
  readFileSync: require.requireActual('fs-extra').readFileSync,
}));
jest.mock('node-ask');

jest.mock('../git/git', () => ({
  getCommit: () => ({
    commit: 'commit',
    committedAt: 1234,
    committerEmail: 'test@test.com',
    committerName: 'tester',
  }),
  getBranch: () => 'branch',
  getBaselineCommits: () => ['baseline'],
}));

jest.mock('../storybook/start-app');
jest.mock('../storybook/get-info', () => () => ({
  version: '5.1.0',
  viewLayer: 'viewLayer',
  addons: [],
}));
jest.mock('../lib/tunnel');
jest.mock('../lib/log', () =>
  Object.keys(console).reduce(
    (acc, k) => ({
      ...acc,
      [k]: jest.fn(),
    }),
    {}
  )
);

jest.mock('../io/upload-to-s3');

jest.mock('../tester/runtimes');
jest.mock('../lib/package-json');

let processEnv;
beforeEach(() => {
  processEnv = process.env;
  process.env = { DISABLE_LOGGING: true };
  confirm.mockReset();
  startApp.mockReset().mockReturnValue({
    on: jest.fn(),
    stderr: { on: jest.fn(), resume: jest.fn() },
    stdout: { on: jest.fn(), resume: jest.fn() },
  });
  checkResponse.mockReset();
  openTunnel.mockReset().mockReturnValue({
    url: 'http://tunnel.com/?clientId=foo',
    cachedUrl: 'http://cached.tunnel.com',
    close: jest.fn,
  });
  getRuntimeSpecs.mockReset().mockReturnValue(['story']);
  kill.mockReset().mockImplementation((pid, sig, cb) => cb());
});
afterEach(() => {
  process.env = processEnv;
});

const defaultOptions = {
  projectToken: 'code',
  scriptName: 'storybook',
  url: 'http://localhost:1337/iframe.html',
  originalArgv: ['node', 'chromatic', '--project-token', 'code'],
};

it('runs in simple situations', async () => {
  // Returns 1 because there is a change
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      autoAcceptChanges: false,
      branch: 'branch',
      commit: 'commit',
      committedAt: 1234,
      baselineCommits: ['baseline'],
      runtimeSpecs: ['story'],
      fromCI: false,
      isTravisPrBuild: false,
      packageVersion,
      storybookVersion: '5.1.0',
      viewLayer: 'viewLayer',
      committerEmail: 'test@test.com',
      committerName: 'tester',
      cachedUrl: 'http://cached.tunnel.com/iframe.html',
    },
    isolatorUrl: `http://tunnel.com/?clientId=foo&path=${encodeURIComponent('/iframe.html')}`,
  });
});

it('properly deals with updating the isolatorUrl/cachedUrl in complex situations', async () => {
  // Returns 1 because there is a change
  expect(
    await runTest({
      ...defaultOptions,
      url: 'http://localhost:1337/iframe.html?foo=bar#hash',
    })
  ).toEqual({ ...defaultOutput, exitCode: 1, exitUrl: 'http://test.com' });

  expect(lastBuild).toMatchObject({
    input: {
      cachedUrl: 'http://cached.tunnel.com/iframe.html?foo=bar#hash',
    },
    isolatorUrl: `http://tunnel.com/?clientId=foo&path=${encodeURIComponent(
      '/iframe.html?foo=bar'
    )}#hash`,
  });
});

it('returns 0 when test have been completed', async () => {
  expect(
    await runTest({
      ...defaultOptions,
      exitZeroOnChanges: true,
    })
  ).toEqual({ ...defaultOutput, exitCode: 0, exitUrl: 'http://test.com' });
});

it('returns 0 when stopped after the build has been sent to chromatic', async () => {
  expect(
    await runTest({
      ...defaultOptions,
      exitOnceUploaded: true,
    })
  ).toEqual({ exitCode: 0, exitUrl: 'http://test.com' });
});

it('returns 0 when the build is publish only', async () => {
  mockBuildFeatures = {
    features: { uiTests: false, uiReview: false },
    wasLimited: false,
  };
  expect(await runTest(defaultOptions)).toEqual({ exitCode: 0, exitUrl: 'http://test.com' });
});

it('detects CI environments successfully', async () => {
  // Standard CI
  process.env = { CI: 'true', DISABLE_LOGGING: 'true' };
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      fromCI: true,
      isTravisPrBuild: false,
    },
  });

  // CI passed as option
  process.env = { DISABLE_LOGGING: 'true' };
  expect(await runTest({ ...defaultOptions, fromCI: true })).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      fromCI: true,
      isTravisPrBuild: false,
    },
  });

  // Netlify CI
  process.env = { REPOSITORY_URL: 'foo', DISABLE_LOGGING: 'true' };
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      fromCI: true,
      isTravisPrBuild: false,
    },
  });

  // Travis PR build, external
  process.env = {
    CI: 'true',
    TRAVIS_EVENT_TYPE: 'pull_request',
    TRAVIS_PULL_REQUEST_SLUG: 'a',
    TRAVIS_REPO_SLUG: 'b',
    TRAVIS_PULL_REQUEST_SHA: 'travis-commit',
    TRAVIS_PULL_REQUEST_BRANCH: 'travis-branch',
    DISABLE_LOGGING: 'true',
  };
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      commit: 'travis-commit',
      branch: 'travis-branch',
      fromCI: true,
      isTravisPrBuild: true,
    },
  });

  // Travis PR build, internal
  process.env = {
    CI: 'true',
    TRAVIS_EVENT_TYPE: 'pull_request',
    TRAVIS_PULL_REQUEST_SLUG: 'a',
    TRAVIS_REPO_SLUG: 'a',
    TRAVIS_PULL_REQUEST_SHA: 'travis-commit',
    TRAVIS_PULL_REQUEST_BRANCH: 'travis-branch',
    DISABLE_LOGGING: 'true',
  };
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(lastBuild).toMatchObject({
    input: {
      commit: 'travis-commit',
      branch: 'travis-branch',
      fromCI: true,
      isTravisPrBuild: true,
    },
  });
});

it('prompts you to a script to your package.json', async () => {
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(confirm).toHaveBeenCalled();
});

it('does not run interactively on CI', async () => {
  process.env = { CI: 'true', DISABLE_LOGGING: 'true' };
  expect(await runTest(defaultOptions)).toEqual({
    ...defaultOutput,
    exitCode: 1,
    exitUrl: 'http://test.com',
  });
  expect(confirm).not.toHaveBeenCalled();
});

it('does not run interactively if you pass interactive:false', async () => {
  expect(
    await runTest({
      ...defaultOptions,
      interactive: false,
    })
  ).toEqual({ ...defaultOutput, exitCode: 1, exitUrl: 'http://test.com' });
  expect(confirm).not.toHaveBeenCalled();
});

it('calls out to npm script passed', async () => {
  await runTest(defaultOptions);
  expect(startApp).toHaveBeenCalledWith({
    scriptName: 'storybook',
    url: 'http://localhost:1337/iframe.html',
    args: ['--', '--ci'],
  });
});

it('calls out to npm build script passed and uploads to s3', async () => {
  startApp.mockReturnValueOnce({
    on: jest.fn().mockImplementation((event, cb) => {
      if (event === 'close') {
        cb(0);
      }
    }),
    stderr: { on: jest.fn(), resume: jest.fn() },
    stdout: { on: jest.fn(), resume: jest.fn() },
  });
  await runTest({
    ...defaultOptions,
    scriptName: null,
    buildScriptName: 'build-storybook',
    noStart: true,
  });
  expect(startApp).toHaveBeenCalledWith(
    expect.objectContaining({
      scriptName: 'build-storybook',
    })
  );
  expect(uploadToS3).toHaveBeenCalled();
});

it('uploads to s3 if storybookBuildDir passed', async () => {
  await runTest({
    ...defaultOptions,
    scriptName: null,
    storybookBuildDir: 'dirname',
    noStart: true,
  });
  expect(startApp).not.toHaveBeenCalled();
  expect(uploadToS3).toHaveBeenCalledWith('dirname', expect.any(Object));
});

it('calls out to command passed', async () => {
  await runTest({
    ...defaultOptions,
    scriptName: undefined,
    exec: 'run something',
  });
  expect(startApp).toHaveBeenCalledWith({
    commandName: 'run something',
    url: 'http://localhost:1337/iframe.html',
  });
});

it('does not start anything if noStart is passed', async () => {
  checkResponse.mockReturnValueOnce(true);
  await runTest({
    ...defaultOptions,
    scriptName: undefined,
    noStart: true,
  });
  expect(startApp).not.toHaveBeenCalled();
  expect(checkResponse).toHaveBeenCalledWith('http://localhost:1337/iframe.html');
});

it('does not start anything if noStart is passed, even if scriptName is set', async () => {
  checkResponse.mockReturnValueOnce(true);
  await runTest({
    ...defaultOptions,
    noStart: true,
  });
  expect(startApp).not.toHaveBeenCalled();
  expect(checkResponse).toHaveBeenCalledWith('http://localhost:1337/iframe.html');
});

it('passes the url into the tunnel', async () => {
  await runTest(defaultOptions);
  expect(openTunnel).toHaveBeenCalledWith({
    port: '1337',
  });
});

it('passes the url directly to the build if noTunnel is set', async () => {
  await runTest({ ...defaultOptions, createTunnel: false });
  expect(openTunnel).not.toHaveBeenCalled();
  expect(lastBuild).toMatchObject({
    isolatorUrl: 'http://localhost:1337/iframe.html',
  });
});

it('stops the Storybook if something goes wrong', async () => {
  openTunnel.mockImplementation(() => {
    throw new Error('tunnel error');
  });
  startApp.mockReturnValueOnce({ pid: 'childpid' });

  await expect(runTest(defaultOptions)).rejects.toThrow('tunnel error');

  expect(kill).toHaveBeenCalledWith('childpid', 'SIGHUP', expect.any(Function));
});

it('stops the tunnel if something goes wrong', async () => {
  const close = jest.fn();
  openTunnel.mockReturnValueOnce({
    url: 'http://tunnel.com/',
    cachedUrl: 'http://tunnel.com/',
    close,
  });
  getRuntimeSpecs.mockImplementation(() => {
    throw new Error('runtime spec error');
  });

  await expect(runTest(defaultOptions)).rejects.toThrow('runtime spec error');

  expect(close).toHaveBeenCalled();
});

it('passes autoAcceptChanges to the index', async () => {
  await runTest({ ...defaultOptions, autoAcceptChanges: true });
  expect(lastBuild).toMatchObject({
    input: { autoAcceptChanges: true },
  });

  await runTest({ ...defaultOptions, autoAcceptChanges: false });
  expect(lastBuild).toMatchObject({
    input: { autoAcceptChanges: false },
  });
});

it('passes autoAcceptChanges to the index based on branch', async () => {
  await runTest({ ...defaultOptions, autoAcceptChanges: 'branch' });
  expect(lastBuild).toMatchObject({
    input: { autoAcceptChanges: true },
  });

  await runTest({ ...defaultOptions, autoAcceptChanges: 'wrong-branch' });
  expect(lastBuild).toMatchObject({
    input: { autoAcceptChanges: false },
  });
});
