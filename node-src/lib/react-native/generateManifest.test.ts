// @ts-expect-error - mocked in tests
import * as sbReactNative from '@storybook/react-native/node';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../testLogger';
import { generateManifest } from './generateManifest';

// Mock all the necessary bits for importing in a Storybook 10+ project
vi.mock('module', () => ({
  createRequire: vi.fn().mockReturnValue({
    resolve: vi.fn().mockReturnValue('/fake/path/to/@storybook/react-native/node'),
  }),
}));

vi.mock('url', () => ({
  pathToFileURL: vi.fn().mockReturnValue({ href: '@storybook/react-native/node' }),
}));

vi.mock('@storybook/react-native/node', () => ({
  buildIndex: vi.fn(),
}));

const mockBuildIndex = vi.mocked(sbReactNative.buildIndex);

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

const fs = await import('fs');
const mkdirSync = vi.mocked(fs.mkdirSync);
const writeFileSync = vi.mocked(fs.writeFileSync);
const existsFileSync = vi.mocked(fs.existsSync);

const sourceDirectory = '/tmp/chromatic';

function getContext(overrides: Record<string, any> = {}) {
  return {
    sourceDir: sourceDirectory,
    log: new TestLogger(),
    options: {},
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateManifest', () => {
  existsFileSync.mockReturnValue(true);

  it('writes manifest to sourceDirectory/manifest.json with correct story shape', async () => {
    mockBuildIndex.mockResolvedValue({
      entries: {
        'button--default': {
          type: 'story',
          id: 'button--default',
          name: 'Default',
          importPath: './Button.stories.tsx',
          title: 'Components/Button',
        },
      },
    });

    const ctx = getContext();
    await generateManifest(ctx);

    const content = writeFileSync.mock.calls[0][1] as string;
    const manifest = JSON.parse(content);

    expect(manifest).toMatchObject({
      stories: [
        {
          storyId: 'button--default',
          name: 'Default',
          fileName: './Button.stories.tsx',
        },
      ],
    });

    expect(mkdirSync).toHaveBeenCalledWith(sourceDirectory, { recursive: true });
    const expectedPath = path.resolve(sourceDirectory, 'manifest.json');
    expect(writeFileSync).toHaveBeenCalledWith(expectedPath, JSON.stringify(manifest, null, 2));
  });

  it('uses default config path when storybookConfigDir is unset', async () => {
    mockBuildIndex.mockResolvedValue({ entries: {} });

    const ctx = getContext();
    await generateManifest(ctx);

    expect(mockBuildIndex).toHaveBeenCalledWith({ configPath: '.rnstorybook' });
  });

  it('uses custom storybookConfigDir when provided', async () => {
    mockBuildIndex.mockResolvedValue({ entries: {} });

    const ctx = getContext({
      options: { storybookConfigDir: 'custom-dir' },
    });
    await generateManifest(ctx);

    expect(mockBuildIndex).toHaveBeenCalledWith({ configPath: 'custom-dir' });
  });

  it('empty index produces empty arrays', async () => {
    mockBuildIndex.mockResolvedValue({ entries: {} });

    const ctx = getContext();
    await generateManifest(ctx);

    const content = writeFileSync.mock.calls[0][1] as string;
    const manifest = JSON.parse(content);
    expect(manifest).toMatchObject({ stories: [], json: [] });
  });

  it('filters out non-story entries', async () => {
    mockBuildIndex.mockResolvedValue({
      entries: {
        'button--default': {
          type: 'story',
          id: 'button--default',
          name: 'Default',
          importPath: './Button.stories.tsx',
          title: 'Components/Button',
        },
        'meta-only': {
          type: 'meta',
          id: 'meta-only',
          name: 'Meta',
          importPath: './meta.ts',
          title: 'Meta',
        },
      },
    });

    const ctx = getContext();
    await generateManifest(ctx);

    const content = writeFileSync.mock.calls[0][1] as string;
    const manifest = JSON.parse(content);
    expect(manifest).toMatchObject({
      stories: [
        {
          storyId: 'button--default',
          name: 'Default',
          fileName: './Button.stories.tsx',
          component: {
            name: 'Components/Button',
            csfId: 'button',
            displayName: 'Button',
            path: ['Components', 'Button'],
          },
        },
      ],
      json: [
        {
          id: 'button--default',
          importPath: './Button.stories.tsx',
          name: 'Default',
          title: 'Components/Button',
          type: 'story',
        },
      ],
    });
  });

  it('multiple stories produce correct count and shape', async () => {
    mockBuildIndex.mockResolvedValue({
      entries: {
        'foo--bar': {
          type: 'story',
          id: 'foo--bar',
          name: 'Bar',
          importPath: './Foo.stories.tsx',
          title: 'A/B/C',
        },
        'other--default': {
          type: 'story',
          id: 'other--default',
          name: 'Default',
          importPath: './Other.stories.tsx',
          title: 'Other',
        },
      },
    });

    const ctx = getContext();
    await generateManifest(ctx);

    const content = writeFileSync.mock.calls[0][1] as string;
    const manifest = JSON.parse(content);

    expect(manifest).toMatchObject({
      stories: [
        {
          storyId: 'foo--bar',
          name: 'Bar',
          fileName: './Foo.stories.tsx',
          component: {
            name: 'A/B/C',
            csfId: 'foo',
            displayName: 'C',
            path: ['A', 'B', 'C'],
          },
        },
        {
          storyId: 'other--default',
          name: 'Default',
          fileName: './Other.stories.tsx',
          component: {
            name: 'Other',
            csfId: 'other',
            displayName: 'Other',
            path: ['Other'],
          },
        },
      ],
      json: [
        {
          id: 'foo--bar',
          importPath: './Foo.stories.tsx',
          name: 'Bar',
          title: 'A/B/C',
          type: 'story',
        },
        {
          id: 'other--default',
          importPath: './Other.stories.tsx',
          name: 'Default',
          title: 'Other',
          type: 'story',
        },
      ],
    });
  });

  it('should throw if the config directory does not exist', async () => {
    existsFileSync.mockReturnValue(false);

    const ctx = getContext();
    await expect(() => generateManifest(ctx)).rejects.toThrow(
      'React Native Storybook config directory not found at ".rnstorybook". Please specify the correct path with --storybook-config-dir.'
    );
  });
});
