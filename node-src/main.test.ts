import { Readable } from 'stream';
import { execa as execaDefault } from 'execa';
import jsonfile from 'jsonfile';
import { confirm } from 'node-ask';
import fetchDefault from 'node-fetch';
import dns from 'dns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as git from './git/git';
import getEnv from './lib/getEnv';
import parseArgs from './lib/parseArgs';
import TestLogger from './lib/testLogger';
import { uploadFiles } from './lib/uploadFiles';
import { runAll } from '.';
import { runBuild } from './runBuild';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import { Context } from './types';
import { DNSResolveAgent } from './io/getDNSResolveAgent';

let announcedBuild;
let publishedBuild;
let mockBuildFeatures;

vi.useFakeTimers();

afterEach(() => {
  // This would clear all existing timer functions
  vi.clearAllTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockBuildFeatures = {
    features: { uiTests: true, uiReview: true },
    wasLimited: false,
  };
});

vi.mock('dns');
vi.mock('execa');

const execa = vi.mocked(execaDefault);
const fetch = vi.mocked(fetchDefault);

vi.mock('jsonfile', async (importOriginal) => {
  const originalModule = (await importOriginal()) as any;
  return {
    __esModule: true,
    ...originalModule,
    default: {
      ...originalModule.default,
      writeFile: vi.fn(() => Promise.resolve()),
    },
  };
});

vi.mock('node-ask');

vi.mock('node-fetch', () => ({
  default: vi.fn(async (url, { body } = {}) => ({
    ok: true,
    json: async () => {
      const { query, variables } = JSON.parse(body);

      // Authenticate
      if (query.match('CreateAppTokenMutation')) {
        return { data: { createAppToken: 'token' } };
      }

      if (query.match('AnnounceBuildMutation')) {
        announcedBuild = variables.input;
        return {
          data: {
            announceBuild: {
              id: 'build-id',
              number: 1,
              status: 'ANNOUNCED',
              app: {
                turboSnapAvailability: 'APPLIED',
              },
            },
          },
        };
      }

      if (query.match('PublishBuildMutation')) {
        if (variables.input.isolatorUrl.startsWith('http://throw-an-error')) {
          throw new Error('fetch error');
        }
        publishedBuild = { id: variables.id, ...variables.input };
        return {
          data: {
            publishBuild: {
              status: 'PUBLISHED',
            },
          },
        };
      }

      if (query.match('StartedBuildQuery')) {
        return {
          data: {
            app: {
              build: {
                startedAt: Date.now(),
              },
            },
          },
        };
      }

      if (query.match('VerifyBuildQuery')) {
        return {
          data: {
            app: {
              build: {
                number: 1,
                status: 'IN_PROGRESS',
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
                    setupUrl: 'https://setup.com',
                  },
                },
                tests: [
                  {
                    spec: { name: 'name', component: { displayName: 'component' } },
                    parameters: { viewport: 320, viewportIsDefault: false },
                    mode: { name: '320px' },
                  },
                ],
                startedAt: Date.now(),
              },
            },
          },
        };
      }

      if (query.match('SnapshotBuildQuery')) {
        return {
          data: {
            app: { build: { status: 'PENDING', changeCount: 1, completedAt: 12345 } },
          },
        };
      }

      if (query.match('FirstCommittedAtQuery')) {
        return { data: { app: { firstBuild: { committedAt: null } } } };
      }

      if (query.match('HasBuildsWithCommitsQuery')) {
        return { data: { app: { hasBuildsWithCommits: [] } } };
      }

      if (query.match('BaselineCommitsQuery')) {
        return {
          data: {
            app: {
              baselineBuilds: [
                {
                  id: 'build-id',
                  number: 1,
                  status: 'PASSED',
                  commit: 'baseline',
                  committedAt: 1234,
                  completedAt: 12345,
                  changeCount: 1,
                },
              ],
            },
          },
        };
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

      if (query.match('LastBuildQuery')) {
        return {
          data: {
            app: {
              isOnboarding: true,
            },
          },
        };
      }

      throw new Error(`Unknown Query: ${query}`);
    },
  })),
}));

const mockStatsFile = Readable.from([
  JSON.stringify({
    modules: [
      {
        id: './src/foo.stories.js',
        name: './src/foo.stories.js',
        reasons: [{ moduleName: './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$' }],
      },
      {
        id: './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$',
        name: './src sync ^\\.\\/(?:(?!\\.)(?=.)[^/]*?\\.stories\\.js)$',
        reasons: [{ moduleName: './storybook-stories.js' }],
      },
    ],
  }),
]);

vi.mock('fs', async (importOriginal) => {
  const originalModule = (await importOriginal()) as any;
  return {
    pathExists: async () => true,
    readFileSync: originalModule.readFileSync,
    createReadStream: vi.fn(() => mockStatsFile),
    createWriteStream: originalModule.createWriteStream,
    readdirSync: vi.fn(() => ['iframe.html', 'index.html', 'preview-stats.json']),
    statSync: vi.fn((path) => {
      const fsStatSync = originalModule.createWriteStream;
      if (path.endsWith('/package.json')) return fsStatSync(path); // for meow
      return { isDirectory: () => false, size: 42 };
    }),
  };
});

vi.mock('./git/git', () => ({
  hasPreviousCommit: () => Promise.resolve(true),
  getCommit: vi.fn(),
  getBranch: () => Promise.resolve('branch'),
  getSlug: () => Promise.resolve('user/repo'),
  getVersion: () => Promise.resolve('2.24.1'),
  getChangedFiles: () => Promise.resolve(['src/foo.stories.js']),
  getRepositoryRoot: () => Promise.resolve(process.cwd()),
  getUncommittedHash: () => Promise.resolve('abc123'),
  getUserEmail: () => Promise.resolve('test@test.com'),
}));

vi.mock('./git/getParentCommits', () => ({
  getParentCommits: () => Promise.resolve(['baseline']),
}));

const getCommit = vi.mocked(git.getCommit);

vi.mock('./lib/emailHash');

vi.mock('./lib/getPackageManager', () => ({
  getPackageManagerName: () => Promise.resolve('pnpm'),
  getPackageManagerRunCommand: (args) => Promise.resolve(`pnpm run ${args.join(' ')}`),
}));

vi.mock('./lib/getStorybookInfo', () => ({
  default: () => ({
    version: '5.1.0',
    viewLayer: 'viewLayer',
    addons: [],
  }),
}));

vi.mock('./lib/uploadFiles');

vi.mock('./lib/spawn', () => ({ default: () => Promise.resolve('https://npm.example.com') }));

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
  http: { fetch: typeof fetch };
} => {
  const testLogger = new TestLogger();
  return {
    title: '',
    env: getEnv(),
    log: testLogger,
    testLogger,
    http: { fetch: vi.fn() },
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
    statsPath: 'preview-stats.json',
    options: {},
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

// Note this tests options errors, but not fatal task or runtime errors.
it('passes options error to experimental_onTaskError', async () => {
  const ctx = getContext([]);
  ctx.options = {
    experimental_onTaskError: vi.fn(),
  } as any;

  ctx.options.experimental_onTaskError = vi.fn();
  ctx.env.CHROMATIC_PROJECT_TOKEN = '';
  await runBuild(ctx);

  await expect(ctx.options.experimental_onTaskError).toHaveBeenCalledWith(
    expect.anything(), // Context
    expect.objectContaining({
      formattedError: expect.stringContaining('Missing project token'), // Long formatted error fatalError https://github.com/chromaui/chromatic-cli/blob/217e77671179748eb4ddb8becde78444db93d067/node-src/ui/messages/errors/fatalError.ts#L11
      originalError: expect.any(Error),
    })
  );
});

it('runs in simple situations', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  await runBuild(ctx);

  expect(ctx.exitCode).toBe(1);
  expect({ ...announcedBuild, ...publishedBuild }).toMatchObject({
    branch: 'branch',
    commit: 'commit',
    committedAt: new Date(1234).toISOString(),
    parentCommits: ['baseline'],
    fromCI: false,
    packageVersion: expect.any(String),
    storybookVersion: '5.1.0',
    storybookViewLayer: 'viewLayer',
    committerEmail: 'test@test.com',
    committerName: 'tester',
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

it('should exit with code 6 and stop the build when abortSignal is aborted', async () => {
  const abortSignal = AbortSignal.abort(new Error('Build canceled'));
  const ctx = getContext(['--project-token=asdf1234']);
  ctx.extraOptions = { experimental_abortSignal: abortSignal };
  await runBuild(ctx);
  expect(ctx.exitCode).toBe(6);
  expect(uploadFiles).not.toHaveBeenCalled();
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
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: true });
});

it('passes autoAcceptChanges to the index based on branch', async () => {
  await runBuild(getContext(['--project-token=asdf1234', '--auto-accept-changes=branch']));
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: true });

  await runBuild(getContext(['--project-token=asdf1234', '--auto-accept-changes=wrong-branch']));
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: false });
});

it('uses custom DNS server if provided', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  ctx.env.CHROMATIC_DNS_SERVERS = ['1.2.3.4'];
  await runBuild(ctx);
  expect(dns.setServers).toHaveBeenCalledWith(['1.2.3.4']);
  // The lookup isn't actually performed because fetch is mocked, so we just check the agent.
  expect((fetch as any).mock.calls[0][1].agent).toBeInstanceOf(DNSResolveAgent);
});

describe('with TurboSnap', () => {
  it('provides onlyStoryFiles to build', async () => {
    const ctx = getContext(['--project-token=asdf1234', '--only-changed']);
    await runBuild(ctx);

    expect(ctx.exitCode).toBe(1);
    expect(ctx.onlyStoryFiles).toEqual(['./src/foo.stories.js']);
    expect(publishedBuild.onlyStoryFiles).toEqual(['./src/foo.stories.js']);
  });
});

describe('in CI', () => {
  it('detects standard CI environments', async () => {
    process.env = { CI: 'true', DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(announcedBuild).toMatchObject({
      fromCI: true,
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects CI passed as option', async () => {
    process.env = { DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234', '--ci']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(announcedBuild).toMatchObject({
      fromCI: true,
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects Netlify CI', async () => {
    process.env = { REPOSITORY_URL: 'foo', DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234']);
    await runBuild(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(announcedBuild).toMatchObject({
      fromCI: true,
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
    expect(announcedBuild).toMatchObject({
      commit: 'travis-commit',
      branch: 'travis-branch',
      fromCI: true,
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
    expect(announcedBuild).toMatchObject({
      commit: 'travis-commit',
      branch: 'travis-branch',
      fromCI: true,
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
