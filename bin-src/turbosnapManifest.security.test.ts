import { createHash } from 'crypto';
import { createReadStream, open as openFile, readFileSync, realpathSync, symlinkSync } from 'fs';
import { open } from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRepositoryRoot } from '../node-src/git/git';
import { createLogger } from '../node-src/lib/log';
import TestLogger from '../node-src/lib/testLogger';
import { temporaryDirectory, write } from '../node-src/lib/turbosnap/v2/__fixtures__/temporaryDisk';
import { serializeManifest } from '../node-src/lib/turbosnap/v2/manifest';
import { main } from './turbosnapManifest';

vi.mock('fs', { spy: true });
vi.mock('fs/promises', { spy: true });
vi.mock('../node-src/git/git', () => ({
  getRepositoryRoot: vi.fn(),
  getIgnoredPaths: vi.fn(async () => new Set<string>()),
  trackedFiles: vi.fn(async function* () {
    yield* [];
  }),
}));
vi.mock('../node-src/lib/log', () => ({ createLogger: vi.fn() }));

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

beforeEach(() => {
  const log = new TestLogger();
  vi.mocked(createLogger).mockReturnValue(log);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error(`Unexpected command exit: ${log.errors.join('\n')}`);
  });
});

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const container = realpathSync(temporaryDirectory());
  const projectRoot = path.join(container, 'repo');
  const outputDirectory = path.join(container, 'output');
  const mainSource = 'export default { framework: "@storybook/react-vite" };';
  const previewSource = 'export default {};';
  const html = '<main>Preview</main>';
  write(projectRoot, '.storybook/main.ts', mainSource);
  write(projectRoot, '.storybook/preview.ts', previewSource);
  write(projectRoot, 'src/Button.stories.tsx', 'export const Button = {};');
  write(
    projectRoot,
    'node_modules/storybook/package.json',
    JSON.stringify({ name: 'storybook', version: '11.0.0' })
  );
  write(outputDirectory, 'iframe.html', html);
  const sentinel = write(container, 'output-sibling/private.txt', 'private fixture contents');
  const statsPath = path.join(container, 'metadata/preview-stats.json');
  const modules = [
    {
      id: 1,
      name: './src/Button.stories.tsx',
      reasons: [{ moduleName: './storybook-stories.js' }],
    },
    {
      id: 2,
      name: './.storybook/preview.ts',
      reasons: [{ moduleName: './storybook-config-entry.js' }],
    },
  ];
  const evidence = {
    version: 1,
    status: 'complete',
    reason: 'final-output',
    builder: { name: '@storybook/builder-vite', version: '11.0.0' },
    projectRoot: './',
    configDir: './.storybook',
    modulesHash: sha256(JSON.stringify(modules)),
    configFiles: {
      './.storybook/main.ts': { hash: sha256(mainSource), realPath: './.storybook/main.ts' },
      './.storybook/preview.ts': {
        hash: sha256(previewSource),
        realPath: './.storybook/preview.ts',
      },
    },
    outputFiles: { 'iframe.html': sha256(html) },
    globalOutputHash: sha256('global'),
    storyOutputHashes: { './src/Button.stories.tsx': sha256('button') },
  };
  vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
  vi.mocked(getRepositoryRoot).mockResolvedValue(projectRoot);

  async function run(outputFlag: string | undefined, metadata: unknown) {
    write(
      path.dirname(statsPath),
      path.basename(statsPath),
      JSON.stringify({ modules, turbosnapOutput: metadata })
    );
    vi.mocked(process.stdout.write).mockClear();
    vi.mocked(open).mockClear();
    vi.mocked(openFile).mockClear();
    vi.mocked(createReadStream).mockClear();
    vi.mocked(readFileSync).mockClear();
    await main([
      '--stats-file',
      statsPath,
      ...(outputFlag === undefined ? [] : ['--storybook-build-dir', outputFlag]),
    ]);
    expect(process.exit).not.toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalledOnce();
    const [output] = vi.mocked(process.stdout.write).mock.calls[0];
    if (typeof output !== 'string') throw new Error('Expected a JSON manifest');
    const manifest: ReturnType<typeof serializeManifest> = JSON.parse(output);
    return manifest;
  }

  return { projectRoot, outputDirectory, sentinel, evidence, run };
}

function expectNoRead(file: string) {
  for (const read of [open, openFile, createReadStream, readFileSync]) {
    for (const [requested] of vi.mocked(read).mock.calls) {
      expect(requested).not.toBe(file);
    }
  }
}

describe('turbosnap-manifest output read boundary', () => {
  it.each(['absolute', 'relative'])(
    'verifies an explicitly selected %s output directory outside Git',
    async (kind) => {
      const { projectRoot, outputDirectory, sentinel, evidence, run } = fixture();
      const manifest = await run(
        kind === 'absolute' ? outputDirectory : path.relative(projectRoot, outputDirectory),
        evidence
      );
      expect(manifest.configAnalysis).toMatchObject({
        mode: 'output',
        reason: 'verified-output-evidence',
      });
      expect(manifest.configCoverage).toBeDefined();
      expect(vi.mocked(open).mock.calls.map(([file]) => file)).toContain(
        path.join(outputDirectory, 'iframe.html')
      );
      expectNoRead(sentinel);
    }
  );

  it.each(['regular file', 'symlink to a file'])(
    'rejects a %s as the selected build directory before reading its contents',
    async (kind) => {
      const { outputDirectory, sentinel, evidence, run } = fixture();
      const selectedRoot =
        kind === 'regular file' ? sentinel : path.join(outputDirectory, 'linked');
      if (kind === 'symlink to a file') symlinkSync(sentinel, selectedRoot, 'file');
      const manifest = await run(selectedRoot, {
        ...evidence,
        outputFiles: { '.': sha256('private fixture contents') },
      });
      expect(manifest.configAnalysis).toMatchObject({
        mode: 'directory',
        reason: 'invalid-output-evidence',
      });
      expect(manifest.configCoverage).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expectNoRead(sentinel);
      expectNoRead(selectedRoot);
    }
  );

  it.each(['parent traversal', 'absolute path'])(
    'rejects a metadata %s into a sibling with the same directory prefix',
    async (kind) => {
      const { outputDirectory, sentinel, evidence, run } = fixture();
      const file = kind === 'absolute path' ? sentinel : '../output-sibling/private.txt';
      const manifest = await run(outputDirectory, {
        ...evidence,
        outputFiles: { ...evidence.outputFiles, [file]: sha256('private fixture contents') },
      });
      expect(manifest.configAnalysis).toMatchObject({
        mode: 'directory',
        reason:
          kind === 'absolute path' ? 'invalid-output-evidence' : 'outside-root-output-evidence',
      });
      expect(manifest.configCoverage).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expectNoRead(sentinel);
      const legacy = await run(outputDirectory, undefined);
      expect(manifest.storyFiles).toEqual(legacy.storyFiles);
      expect(manifest.storybookConfigHashes).toEqual(legacy.storybookConfigHashes);
    }
  );

  it.each(['file', 'directory'])(
    'rejects an output %s symlink before opening its target',
    async (kind) => {
      const { outputDirectory, sentinel, evidence, run } = fixture();
      const link = path.join(outputDirectory, 'linked');
      symlinkSync(
        kind === 'file' ? sentinel : path.dirname(sentinel),
        link,
        kind === 'file' ? 'file' : 'junction'
      );
      const file = kind === 'file' ? 'linked' : 'linked/private.txt';
      const manifest = await run(outputDirectory, {
        ...evidence,
        outputFiles: { ...evidence.outputFiles, [file]: sha256('private fixture contents') },
      });
      expect(manifest.configAnalysis).toMatchObject({
        mode: 'directory',
        reason: 'outside-root-output-evidence',
      });
      expect(manifest.configCoverage).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expectNoRead(sentinel);
      expectNoRead(path.join(outputDirectory, file));
    }
  );

  it.each(['projectRoot', 'configDir', 'configFiles'])(
    'rejects a forged %s outside the independently discovered Git root',
    async (field) => {
      const { outputDirectory, sentinel, evidence, run } = fixture();
      const escaped = '../output-sibling/private.txt';
      const manifest = await run(outputDirectory, {
        ...evidence,
        [field]:
          field === 'configFiles'
            ? {
                ...evidence.configFiles,
                './.storybook/main.ts': {
                  hash: sha256('private fixture contents'),
                  realPath: escaped,
                },
              }
            : escaped,
      });
      expect(manifest.configAnalysis).toMatchObject({
        mode: 'directory',
        reason: 'outside-root-output-evidence',
      });
      expect(manifest.configCoverage).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      expectNoRead(sentinel);
    }
  );

  it('does not let stats metadata replace the independently selected output directory', async () => {
    const { outputDirectory, sentinel, evidence, run } = fixture();
    const manifest = await run(undefined, {
      ...evidence,
      outputDir: outputDirectory,
      outputPath: outputDirectory,
    });
    expect(manifest.configAnalysis.mode).toBe('directory');
    expect(manifest.configCoverage).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
    expectNoRead(path.join(outputDirectory, 'iframe.html'));
    expectNoRead(sentinel);
  });
});
