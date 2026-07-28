import { beforeEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { determineChangedFiles } from './api';
import { TurboSnapManifest } from './manifest';

const client = { runQuery: vi.fn() };
const graphqlClient = client as unknown as GraphQLClient;

const manifest: TurboSnapManifest = {
  files: new Map(),
  storyFileHashes: new Map([['src/Button.stories.ts', 'story-hash']]),
  storybookFiles: new Map([
    ['.storybook/preview.ts', 'preview-hash'],
    ['<storybookGlobals>', 'globals-hash'],
  ]),
  storybookHash: 'storybook-hash',
};

beforeEach(() => {
  client.runQuery.mockReturnValue(true);
});

describe('determineChangedFiles', () => {
  it('uploads the Storybook hash and both hash maps', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', manifest);

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('uploadBuildHashes'),
      {
        buildId: 'build-id',
        storybookHash: 'storybook-hash',
        storyFileHashes: { 'src/Button.stories.ts': 'story-hash' },
        storybookFileHashes: {
          '.storybook/preview.ts': 'preview-hash',
          '<storybookGlobals>': 'globals-hash',
        },
      },
      { retries: 3 }
    );
  });

  it('declares storybookFileHashes in the mutation', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', manifest);

    const [mutation] = client.runQuery.mock.calls[0];
    expect(mutation).toContain('$storybookFileHashes: JSONObject!');
    expect(mutation).toContain('storybookFileHashes: $storybookFileHashes');
  });

  it('sends an empty object when there are no Storybook config files', async () => {
    await determineChangedFiles(graphqlClient, 'build-id', {
      ...manifest,
      storybookFiles: new Map(),
    });

    expect(client.runQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ storybookFileHashes: {} }),
      expect.anything()
    );
  });
});
