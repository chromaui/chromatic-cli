import { describe, expect, it, vi } from 'vitest';

import storybookInfo from '../lib/getStorybookInfo';
import { setStorybookInfo } from './storybookInfo';

vi.mock('../lib/getStorybookInfo');

const getStorybookInfo = vi.mocked(storybookInfo);

describe('storybookInfo', () => {
  it('retrieves Storybook metadata and sets it on context', async () => {
    const storybook = { version: '1.0.0', viewLayer: 'react', addons: [] };
    getStorybookInfo.mockResolvedValue(storybook);

    const ctx = { packageJson: {} } as any;
    await setStorybookInfo(ctx);
    expect(ctx.storybook).toEqual(storybook);
  });

  it('sets hasRouter=true if there is a routing package in package.json', async () => {
    const ctx = {
      packageJson: {
        dependencies: {
          react: '^18',
          'react-dom': '^18',
          'react-router': '^6',
        },
      },
    } as any;
    await setStorybookInfo(ctx);
    expect(ctx.projectMetadata.hasRouter).toEqual(true);
  });

  it('sets hasRouter=false if there is a routing package in package.json dependenices', async () => {
    const ctx = {
      packageJson: {
        dependencies: {
          react: '^18',
          'react-dom': '^18',
        },
        devDependencies: {
          'react-router': '^6',
        },
      },
    } as any;
    await setStorybookInfo(ctx);
    expect(ctx.projectMetadata.hasRouter).toEqual(false);
  });
});
