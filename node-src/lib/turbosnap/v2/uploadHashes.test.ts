import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { TurboSnapManifest } from './manifest';
import { STORYBOOK_GLOBALS_KEY, STORYBOOK_PREVIEW_KEY } from './storybookFileKeys';
import { uploadHashes } from './uploadHashes';

const client = { runQuery: vi.fn() };
const graphqlClient = client as unknown as GraphQLClient;

const manifest: TurboSnapManifest = {
  files: new Map(),
  storyFileHashes: new Map([['./src/Button.stories.ts', 'story-hash']]),
  storybookFileHashes: new Map([
    [STORYBOOK_PREVIEW_KEY, 'preview-hash'],
    [STORYBOOK_GLOBALS_KEY, 'globals-hash'],
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

describe('uploadHashes', () => {
  it('uploads the Storybook hash, the config hashes, and the story file hashes under a nested input', async () => {
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

  it('sends storybookFileHashes under the storybookConfigHashes input field', async () => {
    await uploadHashes(graphqlClient, 'build-id', manifest);

    const [, variables] = client.runQuery.mock.calls[0];
    expect(variables.input.storybookConfigHashes).toEqual(
      Object.fromEntries(manifest.storybookFileHashes)
    );
  });

  it('selects both members of the response union', async () => {
    await uploadHashes(graphqlClient, 'build-id', manifest);

    const [mutation] = client.runQuery.mock.calls[0];
    expect(mutation).toContain('... on BuildUploadHashesSuccess');
    expect(mutation).toContain('... on BuildUploadHashesFailure');
  });

  it('returns the mechanism the Index decided by, so a caller can tell it decided at all', async () => {
    const result = await uploadHashes(graphqlClient, 'build-id', manifest);

    expect(result.build?.turboSnapMechanism).toBe('HASH_BASED');
  });

  it('returns the errors when the upload fails', async () => {
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

  it('sends an empty map of story hashes as an empty object', async () => {
    await uploadHashes(graphqlClient, 'build-id', {
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
