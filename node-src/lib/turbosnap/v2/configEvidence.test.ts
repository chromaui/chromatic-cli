import { createHash } from 'crypto';
import { readFileSync, rmSync, symlinkSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import TestLogger from '../../testLogger';
import { repository, temporaryDirectory, write } from './__fixtures__/temporaryDisk';
import { readConfigEvidence } from './configEvidence';
import { ManifestInput } from './manifestInput';
import { realProjectFiles } from './projectFiles';

const main = './.storybook/main.ts';
const helper = './.storybook/data.json';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function fixture() {
  const gitRoot = repository();
  const projectRoot = path.join(gitRoot, 'packages/ui');
  const outputDirectory = path.join(projectRoot, 'storybook-static');
  write(projectRoot, main, 'export default { framework: "@storybook/react-vite" };');
  write(projectRoot, helper, '{"label":"Button"}');
  write(outputDirectory, 'iframe.html', '<script src="./preview.js"></script>');
  write(outputDirectory, 'preview.js', 'console.log("preview")');
  write(outputDirectory, 'preview-stats.json', '{}');
  const log = new TestLogger();
  const projectFiles = realProjectFiles({ log });
  const input: ManifestInput = {
    log,
    projectRoot,
    gitRoot,
    outputDir: outputDirectory,
    configDir: path.join(projectRoot, '.storybook'),
    staticDirs: [],
    externals: [],
    untraced: [],
    projectFiles,
  };
  const stats: Stats = {
    modules: [{ id: 1, name: helper, reasons: [{ moduleName: './src/Button.stories.tsx' }] }],
  };
  const relative = (file: string) =>
    `./${path.relative(projectRoot, file).split(path.sep).join('/')}`;
  function record() {
    return {
      version: 1,
      status: 'complete',
      reason: 'final-output',
      builder: { name: '@storybook/builder-vite', version: '11.0.0' },
      projectRoot: './',
      configDir: './.storybook',
      modulesHash: sha256(JSON.stringify(stats.modules)),
      configFiles: Object.fromEntries(
        projectFiles.listTree(input.configDir).map((file) => [
          relative(file),
          {
            hash: sha256(readFileSync(file)),
            realPath: relative(projectFiles.realPath(file)),
          },
        ])
      ),
      outputFiles: Object.fromEntries(
        ['iframe.html', 'preview.js'].map((file) => [
          file,
          sha256(readFileSync(path.join(outputDirectory, file))),
        ])
      ),
      globalOutputHash: sha256('global'),
      storyOutputHashes: { './src/Button.stories.tsx': sha256('button') },
    };
  }
  return { input, stats, record, outputDirectory };
}

it('verifies a prebuilt output without requiring installed framework packages', async () => {
  const { input, stats, record } = fixture();
  const evidence = record();
  expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
    status: 'verified',
    globalOutputHash: sha256(
      JSON.stringify([
        evidence.version,
        evidence.builder.name,
        evidence.builder.version,
        evidence.globalOutputHash,
      ])
    ),
    storyOutputHashes: evidence.storyOutputHashes,
  });
});

it('requires an independent output root', async () => {
  const { input, stats, record } = fixture();
  input.outputDir = undefined;
  expect(await readConfigEvidence({ ...stats, turbosnapOutput: record() }, input)).toEqual({
    status: 'unavailable',
    reason: 'output-evidence-unavailable',
  });
});

it.each([main, helper, './storybook-static/preview.js', './storybook-static/iframe.html'])(
  'rejects stale source or uploaded bytes: %s',
  async (file) => {
    const { input, stats, record } = fixture();
    const evidence = record();
    write(input.projectRoot, file, 'changed after the build');
    expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
      status: 'unavailable',
      reason: 'stale-output-evidence',
    });
  }
);

it.each(['.storybook/new.ts', 'storybook-static/new.css'])(
  'rejects a new file omitted from the recorded inventory: %s',
  async (file) => {
    const { input, stats, record } = fixture();
    const evidence = record();
    write(input.projectRoot, file, 'new output or config');
    await expect(
      readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
    ).resolves.toMatchObject({ status: 'unavailable' });
  }
);

it.each(['.storybook/data.json', 'storybook-static/preview.js'])(
  'rejects a deleted binding: %s',
  async (file) => {
    const { input, stats, record } = fixture();
    const evidence = record();
    rmSync(path.join(input.projectRoot, file));
    await expect(
      readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
    ).resolves.toMatchObject({ status: 'unavailable' });
  }
);

it('rejects a source symlink retarget even if its bytes match', async () => {
  const { input, stats, record } = fixture();
  const first = write(input.projectRoot, 'assets/one.json', '{}');
  const second = write(input.projectRoot, 'assets/two.json', '{}');
  const link = path.resolve(input.projectRoot, helper);
  rmSync(link);
  symlinkSync(first, link);
  const evidence = record();
  await expect(
    readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
  ).resolves.toMatchObject({ status: 'verified' });
  rmSync(link);
  symlinkSync(second, link);
  await expect(
    readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
  ).resolves.toMatchObject({ status: 'unavailable' });
});

it('excludes only the selected stats file and internal Chromatic metadata', async () => {
  const { input, stats, record, outputDirectory } = fixture();
  const evidence = record();
  write(outputDirectory, '.chromatic/turbosnap-manifest.json', '{}');
  write(outputDirectory, 'preview-stats.json', 'updated stats');
  await expect(
    readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
  ).resolves.toMatchObject({ status: 'verified' });
  write(outputDirectory, 'another-stats.json', '{}');
  await expect(
    readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
  ).resolves.toMatchObject({ status: 'unavailable' });
});

it('supports independently configured output outside the repository', async () => {
  const { input, stats, record } = fixture();
  const evidence = record();
  input.outputDir = temporaryDirectory();
  write(input.outputDir, 'iframe.html', '<script src="./preview.js"></script>');
  write(input.outputDir, 'preview.js', 'console.log("preview")');
  await expect(
    readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
  ).resolves.toMatchObject({ status: 'verified' });
});

describe('untrusted evidence boundaries', () => {
  it.each(['source', 'output'])(
    'rejects a %s traversal before inspecting any metadata file',
    async (kind) => {
      const { input, stats, record, outputDirectory } = fixture();
      const evidence = record();
      const outside = write(temporaryDirectory(), 'outside.txt', 'outside fixture');
      const file = path
        .relative(kind === 'source' ? input.projectRoot : outputDirectory, outside)
        .split(path.sep)
        .join('/');
      if (kind === 'source')
        evidence.configFiles[file] = { hash: sha256('outside fixture'), realPath: file };
      else evidence.outputFiles[file] = sha256('outside fixture');
      const hash = vi.spyOn(input.projectFiles, 'sourceHashes');
      const realPath = vi.spyOn(input.projectFiles, 'realPath');
      const inventory = vi.spyOn(input.projectFiles, 'listBoundFiles');
      expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
        status: 'unavailable',
        reason: 'outside-root-output-evidence',
      });
      expect(hash).not.toHaveBeenCalled();
      expect(realPath).not.toHaveBeenCalled();
      expect(inventory).not.toHaveBeenCalled();
    }
  );

  it.each(['source', 'output'])(
    'rejects a %s symlink escape even when the declared digest matches',
    async (kind) => {
      const { input, stats, record, outputDirectory } = fixture();
      const evidence = record();
      const file =
        kind === 'source'
          ? path.resolve(input.projectRoot, helper)
          : path.join(outputDirectory, 'preview.js');
      const outside = write(temporaryDirectory(), 'outside.txt', readFileSync(file, 'utf8'));
      rmSync(file);
      symlinkSync(outside, file);
      const hash = vi.spyOn(input.projectFiles, 'sourceHashes');
      expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
        status: 'unavailable',
        reason: 'outside-root-output-evidence',
      });
      expect(hash).not.toHaveBeenCalled();
    }
  );

  it.each([
    'C:relative.js',
    String.raw`C:\outside.js`,
    String.raw`\\server\share\input.js`,
    String.raw`..\outside.js`,
    '/outside.js',
  ])('rejects a non-portable output path %s', async (file) => {
    const { input, stats, record } = fixture();
    const evidence = record();
    evidence.outputFiles[file] = sha256('x');
    const hash = vi.spyOn(input.projectFiles, 'sourceHashes');
    expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
      status: 'unavailable',
      reason: 'invalid-output-evidence',
    });
    expect(hash).not.toHaveBeenCalled();
  });

  it.each(['source', 'output', 'story'])(
    'rejects duplicate normalized %s identities',
    async (kind) => {
      const { input, stats, record } = fixture();
      const evidence = record();
      if (kind === 'source')
        evidence.configFiles['./.storybook/../.storybook/main.ts'] = evidence.configFiles[main];
      else if (kind === 'output')
        evidence.outputFiles['./preview.js'] = evidence.outputFiles['preview.js'];
      else
        Object.assign(evidence.storyOutputHashes, {
          './src/../src/Button.stories.tsx': sha256('button'),
        });
      expect(await readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)).toEqual({
        status: 'unavailable',
        reason: 'invalid-output-evidence',
      });
    }
  );

  it('rejects an output symlink directory missing from the declared inventory without hashing it', async () => {
    const { input, stats, record, outputDirectory } = fixture();
    const evidence = record();
    const outside = temporaryDirectory();
    write(outside, 'secret.txt', 'fixture');
    symlinkSync(outside, path.join(outputDirectory, 'linked'));
    const hash = vi.spyOn(input.projectFiles, 'sourceHashes');
    await expect(
      readConfigEvidence({ ...stats, turbosnapOutput: evidence }, input)
    ).resolves.toMatchObject({ status: 'unavailable' });
    expect(hash).not.toHaveBeenCalled();
  });
});
