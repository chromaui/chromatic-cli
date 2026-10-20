import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { trySetComponentOwnersIfPresent } from './componentowners';
import TestLogger from './testLogger';

describe('trySetComponentOwnersIfPresent', () => {
  let rootPath: string;
  let log: TestLogger;
  const client = { runQuery: vi.fn() };

  beforeEach(async () => {
    rootPath = await mkdtemp(path.join(tmpdir(), 'componentowners-'));
    log = new TestLogger();
    client.runQuery.mockReset();
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  const setOwners = ({ interactive = false } = {}) =>
    trySetComponentOwnersIfPresent(
      { client, log, options: { interactive } } as unknown as Parameters<
        typeof trySetComponentOwnersIfPresent
      >[0],
      rootPath,
      'build-id'
    );

  it.each(['# Some header stuff\nForms/* alice@example.com\n', ''])(
    'sends the repository-root file contents unchanged: %j',
    async (content) => {
      await writeFile(path.join(rootPath, 'COMPONENTOWNERS'), content, 'utf8');

      await setOwners();

      expect(client.runQuery).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/mutation SetComponentOwners\b/),
        { buildId: 'build-id', content }
      );
      expect(log.warn).not.toHaveBeenCalled();
    }
  );

  it('confirms the upload in the log file only when interactive', async () => {
    await writeFile(path.join(rootPath, 'COMPONENTOWNERS'), 'Forms/* alice@example.com', 'utf8');

    await setOwners({ interactive: true });

    expect(log.file).toHaveBeenCalledExactlyOnceWith('Uploaded COMPONENTOWNERS');
    expect(log.info).not.toHaveBeenCalled();
  });

  it('confirms the upload in the regular output when non-interactive', async () => {
    await writeFile(path.join(rootPath, 'COMPONENTOWNERS'), 'Forms/* alice@example.com', 'utf8');

    await setOwners({ interactive: false });

    expect(log.info).toHaveBeenCalledExactlyOnceWith('Uploaded COMPONENTOWNERS');
    expect(log.file).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'skips the mutation and only logs at debug level when the file is absent (interactive: %s)',
    async (interactive) => {
      await expect(setOwners({ interactive })).resolves.toBeUndefined();

      expect(client.runQuery).not.toHaveBeenCalled();
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.info).not.toHaveBeenCalled();
      expect(log.file).not.toHaveBeenCalled();
      expect(log.debug).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('No COMPONENTOWNERS file found')
      );
    }
  );

  it('warns instead of throwing when the file cannot be read', async () => {
    await mkdir(path.join(rootPath, 'COMPONENTOWNERS'));

    await expect(setOwners()).resolves.toBeUndefined();

    expect(client.runQuery).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'Unable to set component owners.',
      expect.objectContaining({ code: 'EISDIR' })
    );
  });

  it('warns instead of throwing when the mutation fails', async () => {
    await writeFile(path.join(rootPath, 'COMPONENTOWNERS'), 'Forms/* alice@example.com', 'utf8');
    const mutationError = new Error('Component owners mutation failed');
    client.runQuery.mockRejectedValue(mutationError);

    await expect(setOwners()).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'Unable to set component owners.',
      mutationError
    );
    expect(log.info).not.toHaveBeenCalled();
  });
});
