import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import makeZipFile from './compress';
import TestLogger from './testLogger';

let sourceDirectory: string;

beforeEach(() => {
  sourceDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-compress-'));
});

afterEach(() => {
  rmSync(sourceDirectory, { recursive: true, force: true });
});

const testContext = { log: new TestLogger() } as any;

describe('makeZipFile', () => {
  it('adds files to an archive at their target paths', async () => {
    writeFileSync(path.join(sourceDirectory, 'index.html'), '<html></html>');
    writeFileSync(path.join(sourceDirectory, 'main.js'), 'console.log("Storybook");'.repeat(100));
    const files = [
      {
        localPath: path.join(sourceDirectory, 'index.html'),
        targetPath: 'index.html',
        contentLength: 13,
      },
      {
        localPath: path.join(sourceDirectory, 'main.js'),
        targetPath: 'assets/main.js',
        contentLength: 2500,
      },
    ];

    const result = await makeZipFile(testContext, files);

    expect(result.size).toBe(statSync(result.path).size);
    const entries = new AdmZip(result.path).getEntries();
    expect(entries.map((entry) => entry.entryName)).toEqual(['index.html', 'assets/main.js']);
    expect(entries[0].getData().toString()).toBe('<html></html>');
    expect(entries[1].getData().toString()).toBe('console.log("Storybook");'.repeat(100));
  });

  it('rejects when a file is missing', async () => {
    const files = [
      { localPath: path.join(sourceDirectory, 'missing'), targetPath: 'missing', contentLength: 1 },
    ];

    await expect(makeZipFile(testContext, files)).rejects.toThrow('ENOENT');
  });
});
