import execaDefault from 'execa';
import { confirm } from 'node-ask';
import treeKill from 'tree-kill';
import fetch from 'node-fetch';

import jsonfile from 'jsonfile';
import * as git from './git/git';
import getEnv from './lib/getEnv';
import parseArgs from './lib/parseArgs';
import * as startStorybook from './lib/startStorybook';
import TestLogger from './lib/testLogger';
import tunnel from './lib/tunnel';
import uploadFiles from './lib/uploadFiles';
import { runAll, runBuild } from './main';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import { Context } from './types';

let lastBuild;
let mockBuildFeatures;

jest.useFakeTimers();

afterEach(() => {
  // This would clear all existing timer functions
  jest.clearAllTimers();
  jest.clearAllMocks();
});

beforeEach(() => {
  mockBuildFeatures = {
    features: { uiTests: true, uiReview: true },
    wasLimited: false,
  };
});

jest.mock('execa');

const execa = <jest.MockedFunction<typeof execaDefault>>execaDefault;

jest.mock('jsonfile', () => {
  const originalModule = jest.requireActual('jsonfile');
  return {
    __esModule: true,
    ...originalModule,
    default: {
      ...originalModule.default,
      writeFile: jest.fn(() => Promise.resolve()),
    },
  };
});

jest.mock('node-ask');

jest.mock('node-fetch', () =>
  jest.fn(async (url, { body } = {}) => ({
    ok: true,
    json: async () => {
      const { query, variables } = JSON.parse(body);

      // Authenticate
      if (query.match('CreateAppTokenMutation')) {
        return { data: { createAppToken: 'token' } };
      }

      if (query.match('CreateBuildMutation')) {
        if (variables.isolatorUrl.startsWith('http://throw-an-error')) {
          throw new Error('fetch error');
        }
        lastBuild = variables;
        return {
          data: {
            createBuild: {
              number: 1,
              specCount: 1,
              componentCount: 1,
              webUrl: 'http://test.com',
              cachedUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/iframe.html',
              ...mockBuildFeatures,
              app: {
                account: {
                  billingUrl: 'https://foo.bar',
                  exceededThreshold: false,
                  paymentRequired: false,
                },
              },
              tests: [
                {
                  spec: { name: 'name', component: { displayName: 'component' } },
                  parameters: { viewport: 320, viewportIsDefault: false },
                },
              ],
            },
          },
        };
      }

      if (query.match('BuildQuery')) {
        return {
          data: {
            app: { build: { status: 'PENDING', changeCount: 1 } },
          },
        };
      }

      if (query.match('FirstCommittedAtQuery')) {
        return { data: { app: { firstBuild: { committedAt: null } } } };
      }

      if (query.match('HasBuildsWithCommitsQuery')) {
        return { data: { app: { hasBuildsWithCommits: [] } } };
      }

      if (query.match('GetUploadUrlsMutation')) {
        return {
          data: {
            getUploadUrls: {
              domain: 'https://chromatic.com',
              urls: [
                {
                  path: 'iframe.html',
                  url: 'https://cdn.example.com/iframe.html',
                  contentType: 'text/html',
                },
                {
                  path: 'index.html',
                  url: 'https://cdn.example.com/index.html',
                  contentType: 'text/html',
                },
              ],
            },
          },
        };
      }

      if (query.match('SkipBuildMutation')) {
        return {
          data: {
            skipBuild: true,
          },
        };
      }

      throw new Error(`Unknown Query: ${query}`);
    },
  }))
);

jest.mock('tree-kill');

const kill = <jest.MockedFunction<typeof treeKill>>treeKill;

jest.mock('fs-extra', () => ({
  pathExists: async () => true,
  readFileSync: jest.requireActual('fs-extra').readFileSync,
  createWriteStream: jest.requireActual('fs-extra').createWriteStream,
  readdirSync: jest.fn(() => ['iframe.html', 'index.html']),
  statSync: jest.fn((path) => {
    const fsStatSync = jest.requireActual('fs-extra').createWriteStream;
    if (path.endsWith('/package.json')) return fsStatSync(path); // for meow
    return { isDirectory: () => false, size: 42 };
  }),
}));

jest.mock('./git/git', () => ({
  hasPreviousCommit: () => Promise.resolve(true),
  getCommit: jest.fn(),
  getBranch: () => Promise.resolve('branch'),
  getSlug: () => Promise.resolve('user/repo'),
  getVersion: () => Promise.resolve('2.24.1'),
}));

jest.mock('./git/getParentCommits', () => ({
  getParentCommits: () => Promise.resolve(['baseline']),
}));

const getCommit = <jest.MockedFunction<typeof git.getCommit>>git.getCommit;

jest.mock('./lib/startStorybook');

const startApp = <jest.MockedFunction<typeof startStorybook.default>>startStorybook.default;
const checkResponse = <jest.MockedFunction<typeof startStorybook.checkResponse>>(
  startStorybook.checkResponse
);

jest.mock('./lib/getStorybookInfo', () => () => ({
  version: '5.1.0',
  viewLayer: 'viewLayer',
  addons: [],
}));
jest.mock('./lib/tunnel');

const openTunnel = <jest.MockedFunction<typeof tunnel>>tunnel;

jest.mock('./lib/uploadFiles');

jest.mock('./lib/spawn', () => () => Promise.resolve('https://npm.example.com'));

let processEnv;
beforeEach(() => {
  processEnv = process.env;
  process.env = {
    DISABLE_LOGGING: 'true',
    CHROMATIC_APP_CODE: undefined,
    CHROMATIC_PROJECT_TOKEN: undefined,
  };
  execa.mockReset();
  execa.mockResolvedValue({ stdout: '1.2.3' } as any);
  getCommit.mockResolvedValue({
    commit: 'commit',
    committedAt: 1234,
    committerEmail: 'test@test.com',
    committerName: 'tester',
  });
});
afterEach(() => {
  process.env = processEnv;
});

const getContext = (
  argv: string[]
): Context & {
  testLogger: TestLogger;
  http: { fetch: jest.MockedFunction<typeof fetch> };
} => {
  const testLogger = new TestLogger();
  return {
    title: '',
    env: getEnv(),
    log: testLogger,
    testLogger,
    http: { fetch: jest.fn() },
    sessionId: ':sessionId',
    packageJson: {
      scripts: {
        storybook: 'start-storybook -p 1337',
        otherStorybook: 'start-storybook -p 7070',
        notStorybook: 'lint',
        'build-storybook': 'build-storybook',
        otherBuildStorybook: 'build-storybook',
      },
    },
    packagePath: '',
    ...parseArgs(argv),
  } as any;
};

it('fails on missing project token', async () => {
  const ctx = getContext([]);
  ctx.env.CHROMATIC_PROJECT_TOKEN = '';
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(254);
  expect(ctx.testLogger.errors[0]).toMatch(/Missing project token/);
});

it('runs in simple situations', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  await runBuild(ctx);

  expect(ctx.exitCode).toBe(1);
  expect(lastBuild).toMatchObject({
    input: {
      branch: 'branch',
      commit: 'commit',
      committedAt: 1234,
      parentCommits: ['baseline'],
      fromCI: false,
      isTravisPrBuild: false,
      packageVersion: expect.any(String),
      storybookVersion: '5.1.0',
      viewLayer: 'viewLayer',
      committerEmail: 'test@test.com',
      committerName: 'tester',
    },
    isolatorUrl: `https://chromatic.com/iframe.html`,
  });
});

it('returns 0 with exit-zero-on-changes', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--exit-zero-on-changes']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('returns 0 with exit-once-uploaded', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--exit-once-uploaded']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('returns 0 when the build is publish only', async () => {
  mockBuildFeatures = {
    features: { uiTests: false, uiReview: false },
    wasLimited: false,
  };
  const ctx = getContext(['--project-token=asdf1234']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('should exit with code 0 when the current branch is skipped', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--skip=branch']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('calls out to npm build script passed and uploads files', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--build-script-name=build-storybook']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(1);
  expect(uploadFiles).toHaveBeenCalledWith(
    expect.any(Object),
    [
      {
        contentLength: 42,
        contentType: 'text/html',
        path: expect.stringMatching(/\/iframe\.html$/),
        url: 'https://cdn.example.com/iframe.html',
      },
      {
        contentLength: 42,
        contentType: 'text/html',
        path: expect.stringMatching(/\/index\.html$/),
        url: 'https://cdn.example.com/index.html',
      },
    ],
    expect.any(Function)
  );
});

it('skips building and uploads directly with storybook-build-dir', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--storybook-build-dir=dirname']);
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(1);
  expect(execa).not.toHaveBeenCalled();
  expect(uploadFiles).toHaveBeenCalledWith(
    expect.any(Object),
    [
      {
        contentLength: 42,
        contentType: 'text/html',
        path: expect.stringMatching(/\/iframe\.html$/),
        url: 'https://cdn.example.com/iframe.html',
      },
      {
        contentLength: 42,
        contentType: 'text/html',
        path: expect.stringMatching(/\/index\.html$/),
        url: 'https://cdn.example.com/index.html',
      },
    ],
    expect.any(Function)
  );
});

it('passes autoAcceptChanges to the index', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--auto-accept-changes']);
  await runBuild(ctx);
  expect(lastBuild).toMatchObject({ input: { autoAcceptChanges: true } });
});

it('passes autoAcceptChanges to the index based on branch', async () => {
  await runBuild(getContext(['--project-token=asdf1234', '--auto-accept-changes=branch']));
  expect(lastBuild).toMatchObject({ input: { autoAcceptChanges: true } });

  await runBuild(getContext(['--project-token=asdf1234', '--auto-accept-changes=wrong-branch']));
  expect(lastBuild).toMatchObject({ input: { autoAcceptChanges: false } });
});

describe('tunneled build', () => {
  beforeEach(() => {
    startApp.mockReset().mockResolvedValue({
      on: jest.fn(),
      stderr: { on: jest.fn(), resume: jest.fn() },
      stdout: { on: jest.fn(), resume: jest.fn() },
    } as any);
    checkResponse.mockReset();
    openTunnel.mockReset().mockResolvedValue({
      url: 'http://tunnel.com/?clientId=foo',
      cachedUrl: 'http://cached.tunnel.com?foo=bar#hash',
      close: jest.fn,
    } as any);
    kill.mockReset().mockImplementation((pid, sig, cb) => cb());
  });

  it('properly deals with updating the isolatorUrl/cachedUrl in complex situations', async () => {
    const ctx = getContext(['--project-token=asdf1234', '--script-name=storybook']);
    await runBuild(ctx);

    expect(ctx.exitCode).toBe(1);
    expect(ctx.closeTunnel).toBeDefined();
    expect(lastBuild).toMatchObject({
      input: { cachedUrl: 'http://cached.tunnel.com/iframe.html?foo=bar' },
      isolatorUrl: `http://tunnel.com/?clientId=foo&path=${encodeURIComponent('/iframe.html')}`,
    });
  });

  it('calls out to npm script passed', async () => {
    const ctx = getContext(['--project-token=asdf1234', '--script-name=storybook']);
    await runBuild(ctx);
    expect(startApp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          scriptName: 'storybook',
          url: 'http://localhost:1337/iframe.html',
        }),
      }),
      expect.objectContaining({
        args: ['--', '--ci'],
      })
    );
  });

  it('calls out to the exec command passed', async () => {
    const ctx = getContext([
      '--project-token=asdf1234',
      '--exec=./run.sh',
      '--storybook-port=9001',
    ]);
    await runBuild(ctx);
    expect(startApp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          exec: './run.sh',
          url: 'http://localhost:9001/iframe.html',
        }),
      }),
      expect.objectContaining({})
    );
    expect(openTunnel).toHaveBeenCalledWith(
      expect.objectContaining(ctx),
      expect.objectContaining({ port: '9001' })
    );
  });

  it('skips start when already running', async () => {
    checkResponse.mockResolvedValue(true);
    const ctx = getContext(['--project-token=asdf1234', '--script-name=storybook']);
    await runBuild(ctx);
    expect(startApp).not.toHaveBeenCalled();
    expect(openTunnel).toHaveBeenCalledWith(
      expect.objectContaining(ctx),
      expect.objectContaining({ port: '1337' })
    );
  });

  it('fails when trying to use --do-not-start while not running', async () => {
    checkResponse.mockResolvedValueOnce(false);
    const ctx = getContext([
      '--project-token=asdf1234',
      '--script-name=storybook',
      '--do-not-start',
    ]);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(255);
    expect(startApp).not.toHaveBeenCalled();
  });

  it('skips tunnel when using --storybook-url', async () => {
    checkResponse.mockResolvedValue(true);
    const ctx = getContext([
      '--project-token=asdf1234',
      '--storybook-url=http://localhost:1337/iframe.html?foo=bar#hash',
    ]);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(ctx.closeTunnel).toBeUndefined();
    expect(openTunnel).not.toHaveBeenCalled();
    expect(lastBuild).toMatchObject({
      isolatorUrl: 'http://localhost:1337/iframe.html?foo=bar#hash',
    });
  });

  it('stops the running Storybook if something goes wrong', async () => {
    openTunnel.mockImplementation(() => {
      throw new Error('tunnel error');
    });
    startApp.mockResolvedValueOnce({ pid: 12345 } as any);
    const ctx = getContext(['--project-token=asdf1234', '--script-name=storybook']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(255);
    expect(ctx.testLogger.errors[0]).toMatch('tunnel error');
    expect(kill).toHaveBeenCalledWith(12345, 'SIGHUP', expect.any(Function));
  });

  it('stops the tunnel if something goes wrong', async () => {
    const close = jest.fn();
    openTunnel.mockResolvedValueOnce({
      url: 'http://throw-an-error',
      cachedUrl: 'http://tunnel.com/',
      close,
    } as any);
    const ctx = getContext(['--project-token=asdf1234', '--script-name=storybook']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(255);
    expect(ctx.testLogger.errors[0]).toMatch('fetch error');
    expect(close).toHaveBeenCalled();
  });
});

describe('in CI', () => {
  it('detects standard CI environments', async () => {
    process.env = { CI: 'true', DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(lastBuild).toMatchObject({
      input: {
        fromCI: true,
        isTravisPrBuild: false,
      },
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects CI passed as option', async () => {
    process.env = { DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234', '--ci']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(lastBuild).toMatchObject({
      input: {
        fromCI: true,
        isTravisPrBuild: false,
      },
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects Netlify CI', async () => {
    process.env = { REPOSITORY_URL: 'foo', DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(lastBuild).toMatchObject({
      input: {
        fromCI: true,
        isTravisPrBuild: false,
      },
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects Travis PR build, external', async () => {
    process.env = {
      CI: 'true',
      TRAVIS_EVENT_TYPE: 'pull_request',
      TRAVIS_PULL_REQUEST_SLUG: 'a',
      TRAVIS_REPO_SLUG: 'b',
      TRAVIS_PULL_REQUEST_SHA: 'travis-commit',
      TRAVIS_PULL_REQUEST_BRANCH: 'travis-branch',
      DISABLE_LOGGING: 'true',
    };
    getCommit.mockReturnValue(
      Promise.resolve({
        commit: 'travis-commit',
        committedAt: 1234,
        committerEmail: 'test@test.com',
        committerName: 'tester',
      })
    );
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(lastBuild).toMatchObject({
      input: {
        commit: 'travis-commit',
        branch: 'travis-branch',
        fromCI: true,
        isTravisPrBuild: true,
      },
    });
    expect(ctx.options.interactive).toBe(false);
    expect(ctx.testLogger.warnings.length).toBe(0);
  });

  it('detects Travis PR build, internal', async () => {
    process.env = {
      CI: 'true',
      TRAVIS_EVENT_TYPE: 'pull_request',
      TRAVIS_PULL_REQUEST_SLUG: 'a',
      TRAVIS_REPO_SLUG: 'a',
      TRAVIS_PULL_REQUEST_SHA: 'travis-commit',
      TRAVIS_PULL_REQUEST_BRANCH: 'travis-branch',
      DISABLE_LOGGING: 'true',
    };
    getCommit.mockReturnValue(
      Promise.resolve({
        commit: 'travis-commit',
        committedAt: 1234,
        committerEmail: 'test@test.com',
        committerName: 'tester',
      })
    );
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(lastBuild).toMatchObject({
      input: {
        commit: 'travis-commit',
        branch: 'travis-branch',
        fromCI: true,
        isTravisPrBuild: true,
      },
    });
    expect(ctx.options.interactive).toBe(false);
    expect(ctx.testLogger.warnings.length).toBe(1);
    expect(ctx.testLogger.warnings[0]).toMatch(
      /Running on a Travis PR build from an internal branch/
    );
  });
});

describe('runAll', () => {
  it('checks for updates', async () => {
    const ctx = getContext(['--project-token=asdf1234']);
    ctx.pkg.version = '4.3.2';
    ctx.http.fetch.mockReturnValueOnce({
      json: () => Promise.resolve({ 'dist-tags': { latest: '5.0.0' } }),
    } as any);
    await runAll(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(ctx.http.fetch).toHaveBeenCalledWith('https://npm.example.com/chromatic');
    expect(ctx.testLogger.warnings[0]).toMatch('Using outdated package');
  });

  it('prompts you to add a script to your package.json', async () => {
    process.stdout.isTTY = true; // enable interactive mode
    const ctx = getContext(['--project-token=asdf1234']);
    await runAll(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(confirm).toHaveBeenCalled();
  });

  it('ctx should be JSON serializable', async () => {
    const ctx = getContext(['--project-token=asdf1234']);
    expect(() => writeChromaticDiagnostics(ctx)).not.toThrow();
  });

  it('should write context to chromatic-diagnostics.json if --diagnostics is passed', async () => {
    const ctx = getContext(['--project-token=asdf1234', '--diagnostics']);
    await runAll(ctx);
    expect(jsonfile.writeFile).toHaveBeenCalledWith(
      'chromatic-diagnostics.json',
      expect.objectContaining({
        flags: expect.objectContaining({
          diagnostics: true,
        }),
        options: expect.objectContaining({
          projectToken: 'asdf1234',
        }),
      }),
      { spaces: 2 }
    );
  });

  it('should not write context to chromatic-diagnostics.json if --diagnostics is not passed', async () => {
    const ctx = getContext(['--project-token=asdf1234']);
    await runAll(ctx);
    expect(jsonfile.writeFile).not.toHaveBeenCalled();
  });
});
