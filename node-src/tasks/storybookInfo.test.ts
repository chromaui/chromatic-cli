import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';

import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import storybookInfo from '../lib/getStorybookInfo';
import { Storybook } from '../types';
import { applyStorybookInfoOutput, setStorybookInfo, StorybookInfoDeps } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');
vi.mock('../lib/getStorybookBaseDirectory');
vi.mock('@sentry/node', () => ({ setTag: vi.fn(), setContext: vi.fn() }));

const getStorybookInfo = vi.mocked(storybookInfo);
const mockedGetStorybookBaseDirectory = vi.mocked(getStorybookBaseDirectory);
const mockedSentrySetTag = vi.mocked(Sentry.setTag);
const mockedSentrySetContext = vi.mocked(Sentry.setContext);

const buildDeps = (overrides: Partial<StorybookInfoDeps> = {}): StorybookInfoDeps =>
  ({
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    options: {},
    env: {},
    packageJson: {},
    ...overrides,
  }) as StorybookInfoDeps;

describe('setStorybookInfo', () => {
  it('returns Storybook metadata combined with the resolved baseDir', async () => {
    const storybook = { version: '1.0.0', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);
    mockedGetStorybookBaseDirectory.mockReturnValue('');

    const result = await setStorybookInfo(buildDeps(), { gitRootPath: '/some/git/root' });

    expect(result).toEqual({
      kind: 'continue',
      output: { storybook: { ...storybook, baseDir: '' } },
    });
  });

  it('passes gitRootPath through to getStorybookBaseDirectory', async () => {
    getStorybookInfo.mockResolvedValue({ version: '1.0.0', addons: [] });
    mockedGetStorybookBaseDirectory.mockReturnValue('packages/storybook');

    await setStorybookInfo(buildDeps({ options: { storybookBaseDir: 'override' } as any }), {
      gitRootPath: '/repo/root',
    });

    expect(mockedGetStorybookBaseDirectory).toHaveBeenCalledWith({
      storybookBaseDir: 'override',
      gitRootPath: '/repo/root',
    });
  });

  it('returns a continue result with only baseDir when getStorybookInfo resolves to {}', async () => {
    getStorybookInfo.mockResolvedValue({});
    mockedGetStorybookBaseDirectory.mockReturnValue('.');

    const result = await setStorybookInfo(buildDeps(), { gitRootPath: '/repo/root' });

    expect(result).toEqual({
      kind: 'continue',
      output: { storybook: { baseDir: '.' } },
    });
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
