import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FileSystem } from './fs';
import { createInMemoryFileSystem } from './fsInMemoryAdapter';
import { createNodeFileSystem } from './fsNodeAdapter';

interface AdapterSetup {
  adapter: FileSystem;
  /**
   * A path that is safe to write into. For the real adapter this is a real
   * directory on disk; for the in-memory adapter it is just a string key.
   */
  workdir: string;
  cleanup: () => Promise<void>;
}

async function nodeSetup(): Promise<AdapterSetup> {
  const adapter = createNodeFileSystem();
  const directory = await adapter.mkdtemp({ prefix: 'fs-contract-', unsafeCleanup: true });
  return {
    adapter,
    workdir: directory.path,
    cleanup: () => directory.cleanup(),
  };
}

async function inMemorySetup(): Promise<AdapterSetup> {
  const adapter = createInMemoryFileSystem();
  await adapter.mkdir('/work', { recursive: true });
  return {
    adapter,
    workdir: '/work',
    cleanup: async () => {},
  };
}

const adapters = [
  ['node', nodeSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('FileSystem (%s)', (_name, makeSetup) => {
  let setup: AdapterSetup;

  beforeEach(async () => {
    setup = await makeSetup();
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('round-trips a UTF-8 string through writeFile and readFile', async () => {
    const filePath = path.join(setup.workdir, 'hello.txt');
    await setup.adapter.writeFile(filePath, 'hello world');
    const result = await setup.adapter.readFile(filePath, 'utf8');
    expect(result).toBe('hello world');
  });

  it('reports existence of files written through the adapter', async () => {
    const filePath = path.join(setup.workdir, 'present.txt');
    await setup.adapter.writeFile(filePath, 'x');
    expect(await setup.adapter.exists(filePath)).toBe(true);
    expect(await setup.adapter.exists(path.join(setup.workdir, 'absent.txt'))).toBe(false);
  });

  it('lists directory entries with readDir', async () => {
    await setup.adapter.writeFile(path.join(setup.workdir, 'a.txt'), '1');
    await setup.adapter.writeFile(path.join(setup.workdir, 'b.txt'), '2');
    const entries = await setup.adapter.readDir(setup.workdir);
    expect([...entries].sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('reports stat with size and isDirectory/isFile', async () => {
    const filePath = path.join(setup.workdir, 'sized.txt');
    await setup.adapter.writeFile(filePath, 'abcdef');
    const stat = await setup.adapter.stat(filePath);
    expect(stat.size).toBe(6);
    expect(stat.isFile()).toBe(true);
    expect(stat.isDirectory()).toBe(false);
  });

  it('creates and removes nested directories', async () => {
    const nested = path.join(setup.workdir, 'a', 'b', 'c');
    await setup.adapter.mkdir(nested, { recursive: true });
    expect(await setup.adapter.exists(nested)).toBe(true);
    await setup.adapter.remove(path.join(setup.workdir, 'a'), { recursive: true, force: true });
    expect(await setup.adapter.exists(nested)).toBe(false);
  });

  it('parses JSON files via readJson', async () => {
    const filePath = path.join(setup.workdir, 'data.json');
    await setup.adapter.writeFile(filePath, JSON.stringify({ greeting: 'hi' }));
    expect(await setup.adapter.readJson(filePath)).toEqual({ greeting: 'hi' });
  });

  it('copies files with copyFile', async () => {
    const source = path.join(setup.workdir, 'source.txt');
    const destination = path.join(setup.workdir, 'destination.txt');
    await setup.adapter.writeFile(source, 'copyme');
    await setup.adapter.copyFile(source, destination);
    expect(await setup.adapter.readFile(destination, 'utf8')).toBe('copyme');
  });
});
