/* eslint-disable max-lines */
import dns from 'dns';
import { execaCommand as execaDefault } from 'execa';
import jsonfile from 'jsonfile';
import { confirm } from 'node-ask';
import fetchDefault from 'node-fetch';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGitInfo, runAll } from '.';
import * as git from './git/git';
import { DNSResolveAgent } from './io/getDNSResolveAgent';
import * as checkPackageJson from './lib/checkPackageJson';
import getEnv from './lib/getEnv';
import parseArgs from './lib/parseArgs';
import TestLogger from './lib/testLogger';
import { uploadFiles } from './lib/uploadFiles';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import { Context } from './types';

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

// NOTE: we'd prefer to mock the require.resolve() of `@chromatic-com/playwright/..` but
// vitest doesn't allow you to do that.
const mockedBuildCommand = 'mocked build command';
vi.mock(import('./lib/e2e'), async (importOriginal) => ({
  ...(await importOriginal()),
  getE2EBuildCommand: () => mockedBuildCommand,
}));

const execaCommand = vi.mocked(execaDefault);
const fetch = vi.mocked(fetchDefault);
const upload = vi.mocked(uploadFiles);

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
    // TODO: refactor this function
    // eslint-disable-next-line complexity, max-statements
    json: async () => {
      let query: string, variables: Record<string, any>;
      try {
        const data = JSON.parse(body);
        query = data.query;
        variables = data.variables;
      } catch {
        // Do nothing
      }

      if (url.match('npm.example.com')) {
        return { 'dist-tags': { latest: '5.0.0' } };
      }

      // Authenticate
      if (query?.match('CreateAppTokenMutation')) {
        return { data: { appToken: 'token' } };
      }
      if (query?.match('CreateCLITokenMutation')) {
        return { data: { cliToken: 'token' } };
      }

      if (query?.match('AnnounceBuildMutation')) {
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

      if (query?.match('PublishBuildMutation')) {
        publishedBuild = {
          id: variables.id,
          ...variables.input,
          storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
        };
        return {
          data: {
            publishBuild: {
              status: 'PUBLISHED',
              storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
            },
          },
        };
      }

      if (query?.match('StartedBuildQuery')) {
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

      if (query?.match('VerifyBuildQuery')) {
        return {
          data: {
            app: {
              build: {
                number: 1,
                status: 'IN_PROGRESS',
                specCount: 1,
                componentCount: 1,
                storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
                webUrl: 'http://test.com',
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

      if (query?.match('SnapshotBuildQuery')) {
        return {
          data: {
            app: { build: { status: 'PENDING', changeCount: 1, completedAt: 12_345 } },
          },
        };
      }

      if (query?.match('FirstCommittedAtQuery')) {
        return { data: { app: { firstBuild: {} } } };
      }

      if (query?.match('HasBuildsWithCommitsQuery')) {
        return { data: { app: { hasBuildsWithCommits: [] } } };
      }

      if (query?.match('BaselineCommitsQuery')) {
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
                  completedAt: 12_345,
                  changeCount: 1,
                },
              ],
            },
          },
        };
      }

      if (query?.match('UploadBuildMutation') || query?.match('UploadMetadataMutation')) {
        const key = query?.match('UploadBuildMutation') ? 'uploadBuild' : 'uploadMetadata';
        const contentTypes = {
          html: 'text/html',
          js: 'text/javascript',
          json: 'application/json',
          log: 'text/plain',
          ts: 'text/typescript',
          tsx: 'text/typescript',
        };
        return {
          data: {
            [key]: {
              info: {
                sentinelUrls: [],
                targets: variables.files.map(({ filePath }) => ({
                  contentType: contentTypes[filePath.split('.').at(-1)],
                  fileKey: '',
                  filePath,
                  formAction: 'https://s3.amazonaws.com',
                  formFields: {},
                })),
              },
              userErrors: [],
            },
          },
        };
      }

      if (query?.match('SkipBuildMutation')) {
        return {
          data: {
            skipBuild: true,
          },
        };
      }

      if (query?.match('LastBuildQuery')) {
        return {
          data: {
            app: {
              isOnboarding: true,
            },
          },
        };
      }

      throw new Error(query ? `Unknown Query: ${query}` : `Unmocked request to ${url}`);
    },
  })),
}));

const mockStats = {
  modules: [
    {
      id: './src/foo.stories.js',
      name: './src/foo.stories.js',
      reasons: [{ moduleName: String.raw`./src sync ^\.\/(?:(?!\.)(?=.)[^/]*?\.stories\.js)$` }],
    },
    {
      id: String.raw`./src sync ^\.\/(?:(?!\.)(?=.)[^/]*?\.stories\.js)$`,
      name: String.raw`./src sync ^\.\/(?:(?!\.)(?=.)[^/]*?\.stories\.js)$`,
      reasons: [{ moduleName: './storybook-stories.js' }],
    },
  ],
};
const mockStatsFile = Readable.from([JSON.stringify(mockStats)]);

vi.mock('./tasks/read-stats-file', () => ({
  readStatsFile: () => Promise.resolve(mockStats),
}));

vi.mock('fs', async (importOriginal) => {
  const originalModule = (await importOriginal()) as any;
  return {
    pathExists: async () => true,
    readFileSync: originalModule.readFileSync,
    writeFileSync: vi.fn(),
    createReadStream: vi.fn(() => mockStatsFile),
    createWriteStream: originalModule.createWriteStream,
    readdirSync: vi.fn(() => ['iframe.html', 'index.html', 'preview-stats.json']),
    stat: originalModule.stat,
    statSync: vi.fn((path) => {
      const fsStatSync = originalModule.createWriteStream;
      if (path.endsWith('/package.json')) return fsStatSync(path); // for meow
      return { isDirectory: () => false, size: 42 };
    }),
    access: vi.fn((_path, callback) => Promise.resolve(callback(undefined))),
  };
});

vi.mock('./git/git', () => ({
  hasPreviousCommit: () => Promise.resolve(true),
  getCommit: vi.fn(),
  getBranch: () => Promise.resolve('branch'),
  getSlug: vi.fn(),
  getVersion: () => Promise.resolve('2.24.1'),
  getChangedFiles: () => Promise.resolve(['src/foo.stories.js']),
  getRepositoryRoot: () => Promise.resolve(process.cwd()),
  getUncommittedHash: () => Promise.resolve('abc123'),
  getUserEmail: () => Promise.resolve('test@test.com'),
  mergeQueueBranchMatch: () => Promise.resolve(undefined),
}));

vi.mock('./git/getParentCommits', () => ({
  getParentCommits: () => Promise.resolve(['baseline']),
}));

const getCommit = vi.mocked(git.getCommit);
const getSlug = vi.mocked(git.getSlug);

vi.mock('./lib/emailHash');

vi.mock('./lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

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
  execaCommand.mockReset();
  execaCommand.mockResolvedValue({ stdout: '1.2.3' } as any);
  getCommit.mockResolvedValue({
    commit: 'commit',
    committedAt: 1234,
    committerEmail: 'test@test.com',
    committerName: 'tester',
  });
  getSlug.mockResolvedValue('user/repo');
});
afterEach(() => {
  process.env = processEnv;
});

const getContext = (argv: string[]): Context & { testLogger: TestLogger } => {
  const testLogger = new TestLogger();
  return {
    title: '',
    env: getEnv(),
    log: testLogger,
    testLogger,
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
  await runAll(ctx);
  expect(ctx.exitCode).toBe(254);
  expect(ctx.testLogger.errors[0]).toMatch(/Missing project token/);
});

// Note this tests options errors, but not fatal task or runtime errors.
it('passes options error to experimental_onTaskError', async () => {
  const ctx = getContext([]);
  ctx.extraOptions = {
    experimental_onTaskError: vi.fn(),
  } as any;

  ctx.env.CHROMATIC_PROJECT_TOKEN = '';
  await runAll(ctx);

  expect(ctx.extraOptions.experimental_onTaskError).toHaveBeenCalledWith(
    expect.anything(), // Context
    expect.objectContaining({
      formattedError: expect.stringContaining('Missing project token'), // Long formatted error fatalError https://github.com/chromaui/chromatic-cli/blob/217e77671179748eb4ddb8becde78444db93d067/node-src/ui/messages/errors/fatalError.ts#L11
      originalError: expect.any(Error),
    })
  );
});

it('runs in simple situations', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  await runAll(ctx);

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
    storybookUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/',
  });
});

it('supports projectId + userToken', async () => {
  const ctx = getContext([]);
  ctx.env.CHROMATIC_PROJECT_TOKEN = '';
  ctx.extraOptions = { projectId: 'project-id', userToken: 'user-token' };
  await runAll(ctx);
  expect(ctx.exitCode).toBe(1);
});

it('returns 0 with exit-zero-on-changes', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--exit-zero-on-changes']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('returns 0 with exit-once-uploaded', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--exit-once-uploaded']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('returns 0 when the build is publish only', async () => {
  mockBuildFeatures = {
    features: { uiTests: false, uiReview: false },
    wasLimited: false,
  };
  const ctx = getContext(['--project-token=asdf1234']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('should exit with code 0 when the current branch is skipped', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--skip=branch']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(0);
});

it('should exit with code 6 and stop the build when abortSignal is aborted', async () => {
  const abortSignal = AbortSignal.abort(new Error('Build canceled'));
  const ctx = getContext(['--project-token=asdf1234']);
  ctx.extraOptions = { experimental_abortSignal: abortSignal };
  await runAll(ctx);
  expect(ctx.exitCode).toBe(6);
  expect(uploadFiles).not.toHaveBeenCalled();
});

it('calls out to npm build script passed and uploads files', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--build-script-name=build-storybook']);
  await runAll(ctx);

  expect(execaCommand).toHaveBeenCalledWith(
    expect.stringMatching(/build-storybook/),
    expect.objectContaining({})
  );

  expect(ctx.exitCode).toBe(1);
  expect(uploadFiles).toHaveBeenCalledWith(
    expect.any(Object),
    [
      {
        contentHash: 'hash',
        contentLength: 42,
        contentType: 'text/html',
        fileKey: '',
        filePath: 'iframe.html',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: expect.stringMatching(/\/iframe\.html$/),
        targetPath: 'iframe.html',
      },
      {
        contentHash: 'hash',
        contentLength: 42,
        contentType: 'text/html',
        fileKey: '',
        filePath: 'index.html',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: expect.stringMatching(/\/index\.html$/),
        targetPath: 'index.html',
      },
    ],
    expect.any(Function)
  );
});

it('skips building and uploads directly with storybook-build-dir', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--storybook-build-dir=dirname']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(1);
  expect(execaCommand).not.toHaveBeenCalled();
  expect(uploadFiles).toHaveBeenCalledWith(
    expect.any(Object),
    [
      {
        contentHash: 'hash',
        contentLength: 42,
        contentType: 'text/html',
        fileKey: '',
        filePath: 'iframe.html',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: expect.stringMatching(/\/iframe\.html$/),
        targetPath: 'iframe.html',
      },
      {
        contentHash: 'hash',
        contentLength: 42,
        contentType: 'text/html',
        fileKey: '',
        filePath: 'index.html',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: expect.stringMatching(/\/index\.html$/),
        targetPath: 'index.html',
      },
    ],
    expect.any(Function)
  );
});

it('builds with playwright with --playwright', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--playwright']);
  await runAll(ctx);
  expect(execaCommand).toHaveBeenCalledWith(mockedBuildCommand, expect.objectContaining({}));
  expect(ctx.exitCode).toBe(1);
});

it('builds with cypress with --cypress', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--cypress']);
  await runAll(ctx);
  expect(execaCommand).toHaveBeenCalledWith(mockedBuildCommand, expect.objectContaining({}));
  expect(ctx.exitCode).toBe(1);
});

it('passes autoAcceptChanges to the index', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--auto-accept-changes']);
  await runAll(ctx);
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: true });
});

it('passes autoAcceptChanges to the index based on branch', async () => {
  await runAll(getContext(['--project-token=asdf1234', '--auto-accept-changes=branch']));
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: true });

  await runAll(getContext(['--project-token=asdf1234', '--auto-accept-changes=wrong-branch']));
  expect(announcedBuild).toMatchObject({ autoAcceptChanges: false });
});

it('uses custom DNS server if provided', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  ctx.env.CHROMATIC_DNS_SERVERS = ['1.2.3.4'];
  await runAll(ctx);
  expect(dns.setServers).toHaveBeenCalledWith(['1.2.3.4']);
  // The lookup isn't actually performed because fetch is mocked, so we just check the agent.
  expect((fetch as any).mock.calls[0][1].agent).toBeInstanceOf(DNSResolveAgent);
});

describe('with TurboSnap', () => {
  it('provides onlyStoryFiles to build', async () => {
    const ctx = getContext(['--project-token=asdf1234', '--only-changed']);
    await runAll(ctx);

    expect(ctx.exitCode).toBe(1);
    expect(ctx.onlyStoryFiles).toEqual(['./src/foo.stories.js']);
    expect(publishedBuild.onlyStoryFiles).toEqual(['./src/foo.stories.js']);
  });
});

describe('in CI', () => {
  it('detects standard CI environments', async () => {
    process.env = { CI: 'true', DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234']);
    await runAll(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(announcedBuild).toMatchObject({
      fromCI: true,
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects CI passed as option', async () => {
    process.env = { DISABLE_LOGGING: 'true' };
    const ctx = getContext(['--project-token=asdf1234', '--ci']);
    await runAll(ctx);
    expect(ctx.exitCode).toBe(1);
    expect(announcedBuild).toMatchObject({
      fromCI: true,
    });
    expect(ctx.options.interactive).toBe(false);
  });

  it('detects Netlify CI', async () => {
    process.env = { REPOSITORY_URL: 'foo', DISABLE_LOGGING: 'true' };
    process.stdout.isTTY = false; // vitest 2.0+ adds this property

    const ctx = getContext(['--project-token=asdf1234']);
    await runAll(ctx);
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
    await runAll(ctx);
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
    await runAll(ctx);
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

it('checks for updates', async () => {
  const ctx = getContext(['--project-token=asdf1234']);
  ctx.pkg.version = '4.3.2';
  await runAll(ctx);
  expect(ctx.exitCode).toBe(1);
  expect(ctx.testLogger.warnings[0]).toMatch('Using outdated package');
  expect(fetch).toHaveBeenCalledWith('https://npm.example.com/chromatic', expect.anything());
});

it('prompts you to add a script to your package.json', async () => {
  process.stdout.isTTY = true; // enable interactive mode
  const ctx = getContext(['--project-token=asdf1234']);
  await runAll(ctx);
  expect(ctx.exitCode).toBe(1);
  expect(confirm).toHaveBeenCalled();
});

it('does not propmpt you to add a script to your package.json for E2E builds', async () => {
  const ctx = getContext(['--project-token=asdf1234', '--playwright']);
  await runAll(ctx);
  const spy = vi.spyOn(checkPackageJson, 'default');
  expect(spy).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
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
        projectToken: undefined, // redacted
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

it('should upload metadata files if --upload-metadata is passed', async () => {
  const ctx = getContext([
    '--project-token=asdf1234',
    '--output-dir=storybook-out',
    '--upload-metadata',
    '--only-changed',
  ]);
  await runAll(ctx);
  expect(upload.mock.calls.at(-1)[1]).toEqual(
    expect.arrayContaining([
      {
        contentLength: expect.any(Number),
        contentType: 'text/typescript',
        fileKey: '',
        filePath: '.chromatic/main.ts',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: '.storybook/main.ts',
        targetPath: '.chromatic/main.ts',
      },
      {
        contentLength: expect.any(Number),
        contentType: 'application/json',
        fileKey: '',
        filePath: '.chromatic/preview-stats.trimmed.json',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: 'storybook-out/preview-stats.trimmed.json',
        targetPath: '.chromatic/preview-stats.trimmed.json',
      },
      {
        contentLength: expect.any(Number),
        contentType: 'text/typescript',
        fileKey: '',
        filePath: '.chromatic/preview.tsx',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: '.storybook/preview.tsx',
        targetPath: '.chromatic/preview.tsx',
      },
      {
        contentLength: expect.any(Number),
        contentType: 'text/html',
        fileKey: '',
        filePath: '.chromatic/index.html',
        formAction: 'https://s3.amazonaws.com',
        formFields: {},
        localPath: expect.any(String),
        targetPath: '.chromatic/index.html',
      },
    ])
  );
});

describe('getGitInfo', () => {
  it('should retreive git info', async () => {
    const result = await getGitInfo();
    expect(result).toMatchObject({
      branch: 'branch',
      commit: 'commit',
      committedAt: 1234,
      committerEmail: 'test@test.com',
      committerName: 'tester',
      slug: 'user/repo',
      uncommittedHash: 'abc123',
      userEmail: 'test@test.com',
      userEmailHash: undefined,
    });
  });

  it('should still return getInfo if no origin url', async () => {
    getSlug.mockRejectedValue(new Error('no origin set'));
    const result = await getGitInfo();
    expect(result).toMatchObject({
      branch: 'branch',
      commit: 'commit',
      committedAt: 1234,
      committerEmail: 'test@test.com',
      committerName: 'tester',
      slug: '',
      uncommittedHash: 'abc123',
      userEmail: 'test@test.com',
      userEmailHash: undefined,
    });
  });
});
