import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { FileHandle, open } from 'fs/promises';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../testLogger';
import { temporaryDirectory, write } from './__fixtures__/temporaryDisk';
import { realProjectFiles } from './projectFiles';

vi.mock('fs/promises', { spy: true });

const log = new TestLogger();

describe('realProjectFiles sourceHashes repository boundary', () => {
  it.each([0, 1, 65_536, 131_073])(
    'preserves normal hashes for a %s-byte binary file',
    async (size) => {
      const root = temporaryDirectory();
      const file = write(root, 'input.bin');
      const bytes = Buffer.alloc(size, 255);
      writeFileSync(file, bytes);
      const files = realProjectFiles({ log });
      const normal = await files.hashAll([file]);
      await expect(files.sourceHashes(file, root)).resolves.toEqual({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        capture: normal[file],
      });
    }
  );

  it('hashes a regular source file inside the repository', async () => {
    const root = temporaryDirectory();
    const file = write(root, 'packages/ui/.storybook/data.json', 'abc');
    await expect(realProjectFiles({ log }).sourceHashes(file, root)).resolves.toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      capture: '44bc2cf5ad770999',
    });
  });

  it('allows a symlink whose target is still inside the repository', async () => {
    const root = temporaryDirectory();
    const target = write(root, 'shared/data.json', 'abc');
    const link = path.join(root, 'data.json');
    symlinkSync(target, link);
    await expect(realProjectFiles({ log }).sourceHashes(link, root)).resolves.toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      capture: '44bc2cf5ad770999',
    });
  });

  it.each(['parent', 'sibling-prefix'])(
    'rejects a %s escape without opening the file',
    async (escape) => {
      const container = temporaryDirectory();
      const root = path.join(container, 'repo');
      write(root, 'source.ts');
      const target = write(container, escape === 'parent' ? 'outside.txt' : 'repo-other/input.txt');
      const requested = path.join(root, path.relative(root, target));
      vi.mocked(open).mockClear();
      await expect(realProjectFiles({ log }).sourceHashes(requested, root)).rejects.toThrow(
        'outside the repository'
      );
      expect(open).not.toHaveBeenCalled();
    }
  );

  it.each(['file', 'directory'])(
    'rejects a %s symlink escape without opening its target',
    async (kind) => {
      const root = temporaryDirectory();
      const outside = temporaryDirectory();
      const target = write(outside, 'input.txt', 'test fixture outside the repository');
      const link = path.join(root, 'link');
      symlinkSync(kind === 'file' ? target : outside, link);
      vi.mocked(open).mockClear();
      await expect(
        realProjectFiles({ log }).sourceHashes(
          kind === 'file' ? link : path.join(link, 'input.txt'),
          root
        )
      ).rejects.toThrow('resolves outside the repository');
      expect(open).not.toHaveBeenCalled();
    }
  );

  it('rejects a relative path before opening anything', async () => {
    vi.mocked(open).mockClear();
    await expect(
      realProjectFiles({ log }).sourceHashes('../input.txt', temporaryDirectory())
    ).rejects.toThrow('outside the repository');
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects a file replaced with an escaping symlink between validation and open', async () => {
    const root = temporaryDirectory();
    const file = write(root, 'input.txt');
    const outside = write(temporaryDirectory(), 'outside.txt');
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    vi.mocked(open).mockImplementationOnce(async (filename, flags) => {
      rmSync(file);
      symlinkSync(outside, file);
      return actual.open(filename, flags);
    });
    await expect(realProjectFiles({ log }).sourceHashes(file, root)).rejects.toThrow();
  });

  it('rejects a directory', async () => {
    const root = temporaryDirectory();
    await expect(realProjectFiles({ log }).sourceHashes(root, root)).rejects.toThrow();
  });

  it('hashes the same descriptor for binding and capture after its path is replaced', async () => {
    const root = temporaryDirectory();
    const file = write(root, 'input.txt', 'abc');
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    const handles: FileHandle[] = [];
    vi.mocked(open).mockImplementationOnce(async (filename, flags) => {
      const handle = await actual.open(filename, flags);
      const stream = handle.createReadStream.bind(handle);
      handles.push(handle);
      vi.spyOn(handle, 'createReadStream').mockImplementation((options) => {
        rmSync(file);
        write(root, 'input.txt', 'changed');
        return stream(options);
      });
      return handle;
    });
    await expect(realProjectFiles({ log }).sourceHashes(file, root)).resolves.toEqual({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      capture: '44bc2cf5ad770999',
    });
    expect(handles[0]?.fd).toBe(-1);
    expect(readFileSync(file, 'utf8')).toBe('changed');
  });

  it('closes the descriptor after a stream error', async () => {
    const root = temporaryDirectory();
    const file = write(root, 'input.txt');
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    const handles: FileHandle[] = [];
    vi.mocked(open).mockImplementationOnce(async (filename, flags) => {
      const handle = await actual.open(filename, flags);
      const stream = handle.createReadStream.bind(handle);
      handles.push(handle);
      vi.spyOn(handle, 'createReadStream').mockImplementation((options) => {
        const reader = stream(options);
        reader.destroy(new Error('Injected read failure'));
        return reader;
      });
      return handle;
    });
    await expect(realProjectFiles({ log }).sourceHashes(file, root)).rejects.toThrow(
      'Injected read failure'
    );
    expect(handles[0]?.fd).toBe(-1);
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a FIFO without blocking on a writer',
    async () => {
      const root = temporaryDirectory();
      const fifo = path.join(root, 'input.pipe');
      execFileSync('mkfifo', [fifo]);
      await expect(realProjectFiles({ log }).sourceHashes(fifo, root)).rejects.toThrow(
        'not the validated regular file'
      );
    }
  );
});

describe('strict bounded inventories', () => {
  it('accepts internal file aliases without losing their upload names', () => {
    const root = temporaryDirectory();
    const source = write(root, 'assets/source.css', 'body {}');
    const link = path.join(root, 'theme.css');
    symlinkSync(source, link);
    expect(realProjectFiles({ log }).listBoundFiles(root, root).sort()).toEqual(
      [source, link].sort()
    );
  });

  it('rejects a directory cycle instead of silently omitting part of the inventory', () => {
    const root = temporaryDirectory();
    write(root, 'assets/source.css', 'body {}');
    symlinkSync(root, path.join(root, 'assets', 'cycle'));
    expect(() => realProjectFiles({ log }).listBoundFiles(root, root)).toThrow(
      'Invalid inventory entry'
    );
  });

  it('rejects directory enumeration outside the independent root', () => {
    const root = temporaryDirectory();
    const outside = temporaryDirectory();
    write(outside, 'other.css', 'body {}');
    expect(() => realProjectFiles({ log }).listBoundFiles(outside, root)).toThrow(
      'outside its root'
    );
  });

  it.skipIf(process.platform === 'win32')('rejects a FIFO rather than omitting it', () => {
    const root = temporaryDirectory();
    execFileSync('mkfifo', [path.join(root, 'output.pipe')]);
    expect(() => realProjectFiles({ log }).listBoundFiles(root, root)).toThrow(
      'Invalid inventory entry'
    );
  });
});
