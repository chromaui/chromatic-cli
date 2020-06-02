import getRuntimeSpecs from '../lib/getRuntimeSpecs';
import { createBuild, setEnvironment, setRuntimeSpecs } from './verify';

jest.mock('../lib/getRuntimeSpecs');

process.env.GERRIT_BRANCH = 'foo/bar';
process.env.TRAVIS_EVENT_TYPE = 'pull_request';

const env = { ENVIRONMENT_WHITELIST: [/^GERRIT/, /^TRAVIS/] };
const log = { warn: jest.fn(), debug: jest.fn() };

describe('setEnvironment', () => {
  it('sets the environment info on context', async () => {
    const ctx = { env, log };
    await setEnvironment(ctx);
    expect(ctx.environment).toBe(
      JSON.stringify({
        GERRIT_BRANCH: 'foo/bar',
        TRAVIS_EVENT_TYPE: 'pull_request',
      })
    );
  });
});

describe('setRuntimeSpecs', () => {
  it('sets the runtimeSpecs on context', async () => {
    getRuntimeSpecs.mockReturnValue([{ name: 'foo' }, { name: 'bar' }]);
    const ctx = { env, log, options: {} };
    await setRuntimeSpecs(ctx, {});
    expect(ctx.runtimeSpecs).toEqual([{ name: 'foo' }, { name: 'bar' }]);
  });

  it('fails if there are no runtimeSpecs', async () => {
    getRuntimeSpecs.mockReturnValue([]);
    const ctx = { env, log, options: {} };
    await expect(setRuntimeSpecs(ctx, {})).rejects.toThrow(/Cannot run a build with no stories/);
    expect(ctx.runtimeSpecs).toEqual([]);
  });
});

describe('createBuild', () => {
  const defaultContext = {
    env,
    log,
    options: {},
    environment: ':environment',
    git: { version: 'whatever' },
    cachedUrl: 'http://...',
    runtimeSpecs: [],
    pkg: { version: '1.0.0' },
    storybook: { version: '2.0.0', viewLayer: 'react', addons: [] },
    isolatorUrl: 'https://tunnel.chromatic.com/',
  };

  it('creates a build on the index and puts it on context', async () => {
    const build = { number: 1, features: { uiTests: true, uiReview: false }, app: {} };
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({ createBuild: build });

    const ctx = { client, ...defaultContext };
    await createBuild(ctx, {});

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringMatching(/TesterCreateBuildMutation/),
      {
        input: {
          autoAcceptChanges: undefined,
          cachedUrl: ctx.cachedUrl,
          environment: ctx.environment,
          patchBaseRef: undefined,
          patchHeadRef: undefined,
          preserveMissingSpecs: undefined,
          runtimeSpecs: ctx.runtimeSpecs,
          packageVersion: ctx.pkg.version,
          storybookVersion: ctx.storybook.version,
          viewLayer: ctx.storybook.viewLayer,
          addons: ctx.storybook.addons,
        },
        isolatorUrl: ctx.isolatorUrl,
      }
    );
    expect(ctx.build).toEqual(build);
    expect(ctx.exitCode).toBe(undefined);
    expect(ctx.skipSnapshots).toBe(undefined);
  });

  it('sets exitCode to 100 if build was limited', async () => {
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({
      createBuild: {
        number: 1,
        features: { uiTests: true, uiReview: false },
        app: { account: {} },
        wasLimited: true,
      },
    });

    const ctx = { client, ...defaultContext };
    await createBuild(ctx, {});
    expect(ctx.exitCode).toBe(100);
  });

  it('sets exitCode to 101 if snapshot quota was reached', async () => {
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({
      createBuild: {
        number: 1,
        features: { uiTests: true, uiReview: false },
        app: { account: { exceededThreshold: true } },
        wasLimited: true,
      },
    });

    const ctx = { client, ...defaultContext };
    await createBuild(ctx, {});
    expect(ctx.exitCode).toBe(101);
  });

  it('sets exitCode to 102 if payment is required', async () => {
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({
      createBuild: {
        number: 1,
        features: { uiTests: true, uiReview: false },
        app: { account: { paymentRequired: true } },
        wasLimited: true,
      },
    });

    const ctx = { client, ...defaultContext };
    await createBuild(ctx, {});
    expect(ctx.exitCode).toBe(102);
  });

  it('sets exitCode to 0 and skips snapshotting for publish-only builds', async () => {
    const client = { runQuery: jest.fn() };
    client.runQuery.mockReturnValue({
      createBuild: {
        number: 1,
        features: { uiTests: false, uiReview: false },
        app: { account: { paymentRequired: true } },
        wasLimited: true,
      },
    });

    const ctx = { client, ...defaultContext };
    await createBuild(ctx, {});
    expect(ctx.exitCode).toBe(0);
    expect(ctx.skipSnapshots).toBe(true);
  });
});
