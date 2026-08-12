import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import storybookInfo from '../lib/getStorybookInfo';
import { getStorybookProjectRoot } from '../lib/getStorybookProjectRoot';
import { Storybook } from '../types';
import { applyStorybookInfoOutput, setStorybookInfo, StorybookInfoDeps } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');
vi.mock('../lib/getStorybookProjectRoot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/getStorybookProjectRoot')>()),
  getStorybookProjectRoot: vi.fn(),
}));
vi.mock('@sentry/node', () => ({ setTag: vi.fn(), setContext: vi.fn() }));

const getStorybookInfo = vi.mocked(storybookInfo);
const mockedGetStorybookProjectRoot = vi.mocked(getStorybookProjectRoot);
const mockedSentrySetTag = vi.mocked(Sentry.setTag);
const mockedSentrySetContext = vi.mocked(Sentry.setContext);

const buildDeps = (overrides: Partial<StorybookInfoDeps> = {}): StorybookInfoDeps =>
  ({
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    options: { buildScriptName: 'build-storybook' },
    env: {},
    packageJson: { scripts: { 'build-storybook': 'build-storybook' } },
    ...overrides,
  }) as StorybookInfoDeps;

describe('setStorybookInfo', () => {
  it('returns Storybook metadata combined with the resolved baseDir', async () => {
    const storybook = { version: '1.0.0', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);
    mockedGetStorybookProjectRoot.mockReturnValue('/some/git/root/packages/sb');

    const result = await setStorybookInfo(buildDeps(), {
      gitRootPath: '/some/git/root',
      isReactNativeApp: false,
    });

    expect(result).toEqual({
      kind: 'continue',
      output: { storybook: { ...storybook, baseDir: 'packages/sb' } },
    });
  });

  it('passes gitRootPath through to getStorybookProjectRoot', async () => {
    getStorybookInfo.mockResolvedValue({ version: '1.0.0', addons: [] });
    mockedGetStorybookProjectRoot.mockReturnValue('/repo/root/override');

    await setStorybookInfo(
      buildDeps({
        options: { buildScriptName: 'build-storybook', storybookBaseDir: 'override' } as any,
      }),
      { gitRootPath: '/repo/root', isReactNativeApp: false }
    );

    expect(mockedGetStorybookProjectRoot).toHaveBeenCalledWith({
      storybookBaseDir: 'override',
      gitRootPath: '/repo/root',
    });
  });

  it('returns a continue result with only baseDir when getStorybookInfo resolves to {}', async () => {
    getStorybookInfo.mockResolvedValue({});
    mockedGetStorybookProjectRoot.mockReturnValue('/repo/root');

    const result = await setStorybookInfo(buildDeps(), {
      gitRootPath: '/repo/root',
      isReactNativeApp: false,
    });

    expect(result).toEqual({
      kind: 'continue',
      output: { storybook: { baseDir: '.' } },
    });
  });

  it('skips the build script check for react-native apps', async () => {
    getStorybookInfo.mockResolvedValue({});
    mockedGetStorybookProjectRoot.mockReturnValue('/repo/root');

    await expect(
      setStorybookInfo(buildDeps({ options: {} as any, packageJson: {} }), {
        gitRootPath: '/repo/root',
        isReactNativeApp: true,
      })
    ).resolves.not.toThrow();
  });

  it('throws missingBuildScriptName when the build script is absent and app is not react-native', async () => {
    await expect(
      setStorybookInfo(
        buildDeps({
          options: { buildScriptName: 'build-storybook' } as any,
          packageJson: { scripts: {} },
        }),
        { gitRootPath: '/repo/root', isReactNativeApp: false }
      )
    ).rejects.toThrow(/build-storybook/);
  });
});

const buildStorybook = (overrides: Partial<Storybook> = {}): Storybook =>
  ({
    version: '1.0.0',
    baseDir: 'packages/sb',
    addons: [],
    ...overrides,
  }) as Storybook;

describe('applyStorybookInfoOutput', () => {
  it('assigns the storybook output onto ctx', () => {
    const ctx = {} as any;
    const storybook = buildStorybook();

    applyStorybookInfoOutput(ctx, { storybook });

    expect(ctx.storybook).toBe(storybook);
  });

  it('tags the Sentry scope with the Storybook version', () => {
    mockedSentrySetTag.mockClear();
    applyStorybookInfoOutput({} as any, { storybook: buildStorybook({ version: '7.6.1' }) });

    expect(mockedSentrySetTag).toHaveBeenCalledWith('storybookVersion', '7.6.1');
  });

  it('does not set a Sentry version tag when the version is missing', () => {
    mockedSentrySetTag.mockClear();
    applyStorybookInfoOutput({} as any, {
      storybook: buildStorybook({ version: undefined as any }),
    });

    expect(mockedSentrySetTag).not.toHaveBeenCalled();
  });

  it('attaches the storybook object as Sentry context', () => {
    mockedSentrySetContext.mockClear();
    const storybook = buildStorybook();

    applyStorybookInfoOutput({} as any, { storybook });

    expect(mockedSentrySetContext).toHaveBeenCalledWith('storybook', { ...storybook });
  });
});
