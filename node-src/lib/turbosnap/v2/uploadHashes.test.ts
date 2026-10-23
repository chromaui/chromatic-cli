import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { TurboSnapManifest } from './manifest';
import { STORYBOOK_GLOBALS_KEY, STORYBOOK_PREVIEW_KEY } from './storybookFileKeys';
import { uploadHashes } from './uploadHashes';

const client = { runQuery: vi.fn() };
const graphqlClient = client as unknown as GraphQLClient;

const manifest: TurboSnapManifest = {
  configAnalysis: {
    mode: 'directory',
    reason: 'output-evidence-unavailable',
    entryFiles: [],
    storyScopedCandidates: [],
    globalFiles: [],
    unattributedFiles: [],
  },
  files: new Map(),
  storyFileHashes: new Map([['./src/Button.stories.ts', 'story-hash']]),
  storybookConfigHashes: new Map([
    [STORYBOOK_PREVIEW_KEY, 'preview-hash'],
    [STORYBOOK_GLOBALS_KEY, 'globals-hash'],
  ]),
  storybookHash: 'storybook-hash',
  attribution: {
    storyReachable: new Set(['./src/Button.stories.ts']),
    previewSubtree: new Set(['./.storybook/preview.ts']),
    storybookGlobals: new Set(),
  },
  outOfGraphFiles: {
    storybookConfigFiles: new Map(),
    staticFiles: new Map(),
    externals: new Map(),
  },
  skippedFiles: new Map(),
};

beforeEach(() => {
  client.runQuery.mockResolvedValue({
    buildUploadHashes: { build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' } },
  });
});

describe('uploadHashes', () => {
  it('uploads the Storybook hash, the config hashes, and the story file hashes', async () => {
    await uploadHashes(graphqlClient, 'build-id', manifest);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('buildUploadHashes'),
      {
        input: {
          buildId: 'build-id',
          storybookHash: 'storybook-hash',
          storybookConfigHashes: { preview: 'preview-hash', storybookGlobals: 'globals-hash' },
          storyFileHashes: { './src/Button.stories.ts': 'story-hash' },
        },
      },
      { retries: 3 }
    );
  });

  it('returns the mechanism the Index decided by, so a caller can tell it decided at all', async () => {
    const result = await uploadHashes(graphqlClient, 'build-id', manifest);

    expect(result.build?.turboSnapMechanism).toBe('HASH_BASED');
  });

  it('returns the errors the Index reported when the upload fails', async () => {
    client.runQuery.mockResolvedValue({
      buildUploadHashes: {
        errors: [{ message: 'Uploading hashes is only allowed for announced builds.' }],
      },
    });

    const result = await uploadHashes(graphqlClient, 'build-id', manifest);

    expect(result.errors).toEqual([
      { message: 'Uploading hashes is only allowed for announced builds.' },
    ]);
  });
});

const configCoverage = {
  version: 1 as const,
  stableConfigHash: 'stable',
  globalOutputHash: 'global',
  storyOutputHashes: { './src/Button.stories.ts': 'output' },
};
const unsupported = {
  message:
    'Variable "$input" got invalid value { configCoverage: {} }; Field "configCoverage" is not defined by type "BuildUploadHashesInput".',
};

it('uploads optional output coverage', async () => {
  await uploadHashes(graphqlClient, 'build-id', { ...manifest, configCoverage });
  expect(client.runQuery).toHaveBeenCalledWith(
    expect.anything(),
    {
      input: expect.objectContaining({ configCoverage }),
    },
    { retries: 3 }
  );
});

it.each([unsupported, [unsupported]])(
  'retries an older server without coverage and with all legacy hashes',
  async (error) => {
    client.runQuery.mockRejectedValueOnce(error);
    await uploadHashes(graphqlClient, 'build-id', { ...manifest, configCoverage });
    expect(client.runQuery).toHaveBeenCalledTimes(2);
    const first = client.runQuery.mock.calls[0][1].input;
    const second = client.runQuery.mock.calls[1][1].input;
    expect(first.configCoverage).toEqual(configCoverage);
    expect(second).toEqual({
      buildId: 'build-id',
      storybookHash: manifest.storybookHash,
      storybookConfigHashes: Object.fromEntries(manifest.storybookConfigHashes),
      storyFileHashes: Object.fromEntries(manifest.storyFileHashes),
    });
  }
);

it.each([
  new Error('Network failure'),
  { message: 'Unauthorized' },
  { message: 'Field "configCoverage" is not defined by type "UnrelatedInput".' },
  [unsupported, { message: 'Another invalid input' }],
  [],
])('does not downgrade unrelated errors', async (error) => {
  client.runQuery.mockRejectedValueOnce(error);
  await expect(
    uploadHashes(graphqlClient, 'build-id', { ...manifest, configCoverage })
  ).rejects.toEqual(error);
  expect(client.runQuery).toHaveBeenCalledTimes(1);
});

it('does not retry an unsupported-field error when coverage was not sent', async () => {
  client.runQuery.mockRejectedValueOnce(unsupported);
  await expect(uploadHashes(graphqlClient, 'build-id', manifest)).rejects.toEqual(unsupported);
  expect(client.runQuery).toHaveBeenCalledTimes(1);
});
