import TestLogger from '@cli/testLogger';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnouncedBuild } from '../../types';
import { announceBuild } from './announceBuild';
import { initialize } from './index';

vi.mock('./announceBuild');
vi.mock('./gatherEnvironment');
vi.mock('./getRuntimeMetadata');

describe('component owners during initialization', () => {
  const content = 'Forms/* alice@example.com';
  const announcedBuild = { id: 'announced-build-id' } as AnnouncedBuild;
  const client = { runQuery: vi.fn() };
  let rootPath: string;
  let deps: Parameters<typeof initialize>[0];
  let input: Parameters<typeof initialize>[1];

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'initialize-componentowners-'));
    await writeFile(path.join(rootPath, 'COMPONENTOWNERS'), content, 'utf8');
    client.runQuery.mockReset();
    vi.mocked(announceBuild).mockResolvedValue(announcedBuild);
    deps = { client, log: new TestLogger(), options: {} } as unknown as typeof deps;
    input = { partialAnnounceBuildInput: { git: { rootPath } } } as typeof input;
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('sets owners for the newly announced build', async () => {
    await expect(initialize(deps, input)).resolves.toMatchObject({ kind: 'continue' });

    expect(client.runQuery).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/mutation SetComponentOwners\b/),
      { buildId: announcedBuild.id, content }
    );
  });

  it('preserves the initialization result when setting owners fails', async () => {
    const error = new Error('Component owners mutation failed');
    client.runQuery.mockRejectedValue(error);

    await expect(initialize(deps, input)).resolves.toMatchObject({
      kind: 'continue',
      output: { announcedBuild },
    });

    expect(deps.log.warn).toHaveBeenCalledExactlyOnceWith('Unable to set component owners.', error);
  });

  it('sets owners during a dry run when the file exists', async () => {
    await expect(
      initialize({ ...deps, options: { ...deps.options, dryRun: true } }, input)
    ).resolves.toMatchObject({ kind: 'continue' });

    expect(client.runQuery).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/mutation SetComponentOwners\b/),
      { buildId: announcedBuild.id, content }
    );
  });

  it('does not set owners when the repository root is unavailable', async () => {
    input.partialAnnounceBuildInput.git.rootPath = undefined;

    await expect(initialize(deps, input)).resolves.toMatchObject({ kind: 'continue' });

    expect(client.runQuery).not.toHaveBeenCalled();
    expect(deps.log.warn).toHaveBeenCalledExactlyOnceWith(
      'git.rootPath unexpectedly undefined. Should have been set in the gitInfo task upstream.'
    );
  });
});
