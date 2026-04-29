import { describe, expect, it, vi } from 'vitest';

import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo, StorybookInfoDeps } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');
vi.mock('../lib/getStorybookBaseDirectory');

const getStorybookInfo = vi.mocked(storybookInfo);
const mockedGetStorybookBaseDirectory = vi.mocked(getStorybookBaseDirectory);

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
});
