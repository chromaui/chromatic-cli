import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { determineChangedFiles } from './api';
import { TurboSnapManifest } from './manifest';

const client = { runQuery: vi.fn() };
const graphqlClient = client as unknown as GraphQLClient;

const manifest: TurboSnapManifest = {
  files: new Map(),
  storyFileHashes: new Map([['./src/Button.stories.ts', 'story-hash']]),
  unrecognizedStoryEntries: [],
  storybookFiles: new Map([
    ['./.storybook/preview.ts', 'preview-hash'],
    ['storybookGlobals', 'globals-hash'],
  ]),
  storybookHash: 'storybook-hash',
  attribution: {
    storyReachable: new Set(['./src/Button.stories.ts']),
    previewSubtree: new Set(['./.storybook/preview.ts']),
    storybookGlobals: new Set(),
  },
  // Present on the manifest for the S3 debug file, but deliberately not uploaded to the Index.
  outOfGraphFiles: { storybookConfigFiles: new Map(), staticFiles: new Map() },
};

beforeEach(() => {
  client.runQuery.mockResolvedValue({
    buildUploadHashes: { build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' } },
  });
});

describe('determineChangedFiles', () => {
  it('uploads the Storybook hash and the story file hashes under a nested input', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', manifest);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('buildUploadHashes'),
      {
        input: {
          buildId: 'build-id',
          storybookHash: 'storybook-hash',
          storyFileHashes: { './src/Button.stories.ts': 'story-hash' },
        },
      },
      { retries: 3 }
    );
  });

  it('does not send storybookFileHashes, which the input type has no field for', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', manifest);

    const [mutation, variables] = client.runQuery.mock.calls[0];
    expect(mutation).not.toContain('storybookFileHashes');
    expect(variables.input).not.toHaveProperty('storybookFileHashes');
  });

  it('selects both members of the response union', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', manifest);

    const [mutation] = client.runQuery.mock.calls[0];
    expect(mutation).toContain('... on BuildUploadHashesSuccess');
    expect(mutation).toContain('... on BuildUploadHashesFailure');
  });

  it('returns the mechanism the Index decided by, so a caller can tell it decided at all', async () => {
    const result = await determineChangedFiles(graphqlClient, 'build-id', manifest);

    expect(result.build?.turboSnapMechanism).toBe('HASH_BASED');
  });

  it('returns the errors when the upload fails', async () => {
    client.runQuery.mockResolvedValue({
      buildUploadHashes: {
        errors: [{ message: 'Uploading hashes is only allowed for announced builds.' }],
      },
    });

    const result = await determineChangedFiles(graphqlClient, 'build-id', manifest);

    expect(result.errors).toEqual([
      { message: 'Uploading hashes is only allowed for announced builds.' },
    ]);
  });

  it('sends an empty map of story hashes as an empty object', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', {
      ...manifest,
      storyFileHashes: new Map(),
    });

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ input: expect.objectContaining({ storyFileHashes: {} }) }),
      expect.anything()
    );
  });
});
