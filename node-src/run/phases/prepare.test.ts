import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryDependencyTracer } from '../../lib/ports/dependencyTracerInMemoryAdapter';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { PreparePhaseError, runPreparePhase } from './prepare';

vi.mock('adm-zip', () => ({ default: vi.fn() }));

vi.mock('../../lib/getFileHashes', () => ({
  getFileHashes: vi.fn(async (files: string[]) =>
    Object.fromEntries(files.map((file) => [file, 'hash']))
  ),
}));

const AdmZipMock = vi.mocked(AdmZip);

function mockApkEntries(entryNames: string[]) {
  const entries = entryNames.map((entryName) => ({ entryName }));
  AdmZipMock.mockImplementation(function (this: { getEntries: () => typeof entries }) {
    this.getEntries = () => entries;
  } as any);
}

function makeAndroidPorts() {
  return makePorts({
    fs: {
      ...makeFakeFs({
        trees: { '/static': fileTree({ 'storybook.apk': 42, 'manifest.json': 42 }) },
      }),
      readFile: vi.fn(async () => Buffer.from('apk')),
    },
  });
}

interface FakeDirectoryEntry {
  type: 'dir';
  children: Record<string, FakeFsEntry>;
}
interface FakeFileEntry {
  type: 'file';
  size: number;
}
type FakeFsEntry = FakeDirectoryEntry | FakeFileEntry;

function fileTree(spec: Record<string, number>): FakeDirectoryEntry {
  const root: FakeDirectoryEntry = { type: 'dir', children: {} };
  for (const [path, size] of Object.entries(spec)) {
    const segments = path.split('/');
    let current: FakeDirectoryEntry = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const child = current.children[segment];
      if (!child || child.type !== 'dir') {
        const directory: FakeDirectoryEntry = { type: 'dir', children: {} };
        current.children[segment] = directory;
        current = directory;
      } else {
        current = child;
      }
    }
    current.children[segments.at(-1) as string] = { type: 'file', size };
  }
  return root;
}

function resolveEntry(root: FakeDirectoryEntry, path: string): FakeFsEntry | undefined {
  const segments = path.split('/').filter((s) => s && s !== '.');
  let current: FakeFsEntry = root;
  for (const segment of segments) {
    if (current.type !== 'dir') return undefined;
    const next = current.children[segment];
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function makeFakeFs(spec: { trees?: Record<string, FakeDirectoryEntry>; readFile?: string }) {
  const trees = spec.trees ?? {};
  return {
    readDir: vi.fn(async (path: string) => {
      for (const [base, root] of Object.entries(trees)) {
        if (path === base) return Object.keys(root.children);
        if (path.startsWith(`${base}/`)) {
          const relative = path.slice(base.length + 1);
          const resolved = resolveEntry(root, relative);
          if (resolved && resolved.type === 'dir') return Object.keys(resolved.children);
        }
      }
      throw new Error(`ENOENT: ${path}`);
    }),
    stat: vi.fn(async (path: string) => {
      for (const [base, root] of Object.entries(trees)) {
        if (path === base) return { size: 0, isFile: () => false, isDirectory: () => true };
        if (path.startsWith(`${base}/`)) {
          const relative = path.slice(base.length + 1);
          const resolved = resolveEntry(root, relative);
          if (!resolved) throw new Error(`ENOENT: ${path}`);
          return resolved.type === 'dir'
            ? { size: 0, isFile: () => false, isDirectory: () => true }
            : { size: resolved.size, isFile: () => true, isDirectory: () => false };
        }
      }
      throw new Error(`ENOENT: ${path}`);
    }),
    readFile: vi.fn(async () => spec.readFile ?? ''),
  };
}

const baseEnvironment = { CHROMATIC_HASH_CONCURRENCY: 4 };
const baseClock = { now: () => 0, since: () => 0, sleep: async () => undefined };

function makePorts(overrides: { fs?: any; tracer?: any } = {}) {
  return {
    fs: overrides.fs ?? makeFakeFs({}),
    tracer: overrides.tracer ?? createInMemoryDependencyTracer({}),
    clock: baseClock,
  } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('runPreparePhase', () => {
  it('enumerates files and validates a standard storybook build', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'iframe.html': 42, 'index.html': 42 }) },
      }),
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static' },
      git: {} as any,
      log,
      ports,
    });
    expect(result.sourceDir).toBe('/static');
    expect(result.fileInfo.paths).toEqual(['iframe.html', 'index.html']);
    expect(result.fileInfo.total).toBe(84);
    expect(result.outcome).toEqual({ kind: 'prepared' });
    expect(result.turboSnap).toBeUndefined();
  });

  it('throws PreparePhaseError when iframe.html is missing', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'index.html': 42 }) },
      }),
    });
    await expect(
      runPreparePhase({
        options: {} as Options,
        env: baseEnvironment,
        artifacts: { sourceDir: '/static' },
        git: {} as any,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'PreparePhaseError',
      category: 'invalid-storybook',
    });
  });

  it('skips the .chromatic directory', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({
            'iframe.html': 42,
            'index.html': 42,
            '.chromatic/zip.txt': 42,
          }),
        },
      }),
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static' },
      git: {} as any,
      log,
      ports,
    });
    expect(result.fileInfo.paths).toEqual(['iframe.html', 'index.html']);
  });

  it('retries with the buildLog output directory when the original is invalid', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({}),
          '/var/storybook-static': fileTree({ 'iframe.html': 42, 'index.html': 42 }),
        },
        readFile: 'info => Output directory: /var/storybook-static\n',
      }),
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static', buildLogFile: '/build.log' },
      git: {} as any,
      packageJson: {},
      log,
      ports,
    });
    expect(result.sourceDir).toBe('/var/storybook-static');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected build directory'));
    expect(result.fileInfo.total).toBe(84);
  });

  it('validates a React Native build with android browser', async () => {
    mockApkEntries([]);
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'storybook.apk': 42, 'manifest.json': 42 }) },
      }),
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      isReactNativeApp: true,
      browsers: ['android'],
      artifacts: { sourceDir: '/static' },
      git: {} as any,
      log,
      ports,
    });
    expect(result.fileInfo.paths).toEqual(['storybook.apk', 'manifest.json']);
  });

  it('throws when a React Native build is missing the APK', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'manifest.json': 42 }) },
      }),
    });
    await expect(
      runPreparePhase({
        options: {} as Options,
        env: baseEnvironment,
        isReactNativeApp: true,
        browsers: ['android'],
        artifacts: { sourceDir: '/static' },
        git: {} as any,
        log,
        ports,
      })
    ).rejects.toMatchObject({
      name: 'PreparePhaseError',
      category: 'invalid-storybook',
    });
  });

  it('extracts statsPath and excludes manager-stats.json from upload paths', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({
            'iframe.html': 42,
            'index.html': 42,
            'preview-stats.json': 100,
            'manager-stats.json': 50,
          }),
        },
      }),
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static' },
      git: {} as any,
      log,
      ports,
    });
    expect(result.fileInfo.paths).toEqual(['iframe.html', 'index.html']);
    expect(result.fileInfo.statsPath).toBe('/static/preview-stats.json');
  });

  it('returns turbosnap-traced outcome with escaped story file keys', async () => {
    const log = new TestLogger();
    const tracer = createInMemoryDependencyTracer({
      default: {
        onlyStoryFiles: {
          './$example.stories.js': ['./$example.stories.js'],
          './example.stories.js': ['./example.stories.js'],
        },
      },
    });
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({
            'iframe.html': 42,
            'index.html': 42,
            'preview-stats.json': 100,
          }),
        },
      }),
      tracer,
    });
    const result = await runPreparePhase({
      options: { interactive: true } as Options,
      env: baseEnvironment,
      storybook: { version: '8.0.0' } as any,
      artifacts: { sourceDir: '/static' },
      git: { changedFiles: ['./example.js'] } as any,
      turboSnap: {},
      log,
      ports,
    });
    expect(result.outcome).toEqual({ kind: 'turbosnap-traced', affectedStoryFiles: 2 });
    expect(result.onlyStoryFiles).toEqual([
      String.raw`./\$example.stories.js`,
      './example.stories.js',
    ]);
  });

  it('returns turbosnap-bailed outcome when tracer returns undefined', async () => {
    const log = new TestLogger();
    const tracer = createInMemoryDependencyTracer({
      default: { bailReason: { changedExternalFiles: ['vite.config.ts'] } },
    });
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({
            'iframe.html': 42,
            'index.html': 42,
            'preview-stats.json': 100,
          }),
        },
      }),
      tracer,
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      storybook: { version: '8.0.0' } as any,
      artifacts: { sourceDir: '/static' },
      git: { changedFiles: ['./vite.config.ts'] } as any,
      turboSnap: {},
      log,
      ports,
    });
    expect(result.outcome).toEqual({ kind: 'turbosnap-bailed' });
    expect(result.turboSnap?.bailReason).toEqual({ changedExternalFiles: ['vite.config.ts'] });
  });

  it('throws PreparePhaseError(missing-stats-file) when stats file is absent', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'iframe.html': 42, 'index.html': 42 }) },
      }),
    });
    const error = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      storybook: { version: '8.0.0' } as any,
      artifacts: { sourceDir: '/static' },
      git: { changedFiles: ['./a.js'] } as any,
      turboSnap: {},
      log,
      ports,
    }).catch((error_) => error_);
    expect(error).toBeInstanceOf(PreparePhaseError);
    expect(error.category).toBe('missing-stats-file');
    expect(error.turboSnap.bailReason).toEqual({ missingStatsFile: true });
  });

  it('skips tracing when turboSnap is unavailable', async () => {
    const log = new TestLogger();
    const tracer = { traceChangedFiles: vi.fn() };
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'iframe.html': 42, 'index.html': 42 }) },
      }),
      tracer,
    });
    const result = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static' },
      git: { changedFiles: ['./a.js'] } as any,
      turboSnap: { unavailable: true },
      log,
      ports,
    });
    expect(tracer.traceChangedFiles).not.toHaveBeenCalled();
    expect(result.outcome).toEqual({ kind: 'prepared' });
    expect(result.turboSnap).toEqual({ unavailable: true });
  });

  it('hashes file paths when fileHashing is enabled', async () => {
    const log = new TestLogger();
    const ports = makePorts({
      fs: makeFakeFs({
        trees: { '/static': fileTree({ 'iframe.html': 42, 'index.html': 42 }) },
      }),
    });
    const result = await runPreparePhase({
      options: { fileHashing: true } as Options,
      env: baseEnvironment,
      artifacts: { sourceDir: '/static' },
      git: {} as any,
      log,
      ports,
    });
    expect(result.fileInfo.hashes).toEqual({ 'iframe.html': 'hash', 'index.html': 'hash' });
  });

  it('rewrites tracer errors with the dependent-files message', async () => {
    const log = new TestLogger();
    const tracer = createInMemoryDependencyTracer({
      default: { error: new Error('boom') },
    });
    const ports = makePorts({
      fs: makeFakeFs({
        trees: {
          '/static': fileTree({
            'iframe.html': 42,
            'index.html': 42,
            'preview-stats.json': 100,
          }),
        },
      }),
      tracer,
    });
    const error = await runPreparePhase({
      options: {} as Options,
      env: baseEnvironment,
      storybook: { version: '8.0.0' } as any,
      artifacts: { sourceDir: '/static' },
      git: { changedFiles: ['./a.js'] } as any,
      turboSnap: {},
      log,
      ports,
    }).catch((error_) => error_);
    expect(error).toBeInstanceOf(PreparePhaseError);
    expect(error.category).toBe('tracer-error');
    expect(error.message).toContain('Could not retrieve dependent story files');
    expect(error.message).toContain('boom');
  });

  describe('validateAndroidArtifact', () => {
    it('skips when android is not in browsers', async () => {
      const log = new TestLogger();
      const ports = makePorts({
        fs: makeFakeFs({
          trees: { '/static': fileTree({ 'storybook.app/modules.json': 42, 'manifest.json': 42 }) },
        }),
      });
      await runPreparePhase({
        options: {} as Options,
        env: baseEnvironment,
        isReactNativeApp: true,
        browsers: ['ios'],
        artifacts: { sourceDir: '/static' },
        git: {} as any,
        log,
        ports,
      });
      expect(AdmZipMock).not.toHaveBeenCalled();
    });

    it('passes when APK has no lib/ entries', async () => {
      mockApkEntries(['AndroidManifest.xml', 'classes.dex']);
      const log = new TestLogger();
      await expect(
        runPreparePhase({
          options: {} as Options,
          env: baseEnvironment,
          isReactNativeApp: true,
          browsers: ['android'],
          artifacts: { sourceDir: '/static' },
          git: {} as any,
          log,
          ports: makeAndroidPorts(),
        })
      ).resolves.toBeDefined();
    });

    it('passes when APK has only lib/x86_64/ entries', async () => {
      mockApkEntries(['lib/x86_64/libnative.so']);
      const log = new TestLogger();
      await expect(
        runPreparePhase({
          options: {} as Options,
          env: baseEnvironment,
          isReactNativeApp: true,
          browsers: ['android'],
          artifacts: { sourceDir: '/static' },
          git: {} as any,
          log,
          ports: makeAndroidPorts(),
        })
      ).resolves.toBeDefined();
    });

    it('passes when APK has lib/x86_64/ alongside other ABIs', async () => {
      mockApkEntries(['lib/x86_64/libnative.so', 'lib/arm64-v8a/libnative.so']);
      const log = new TestLogger();
      await expect(
        runPreparePhase({
          options: {} as Options,
          env: baseEnvironment,
          isReactNativeApp: true,
          browsers: ['android'],
          artifacts: { sourceDir: '/static' },
          git: {} as any,
          log,
          ports: makeAndroidPorts(),
        })
      ).resolves.toBeDefined();
    });

    it('throws PreparePhaseError when APK has only ARM ABI entries', async () => {
      mockApkEntries(['lib/armeabi-v7a/libnative.so']);
      const log = new TestLogger();
      await expect(
        runPreparePhase({
          options: {} as Options,
          env: baseEnvironment,
          isReactNativeApp: true,
          browsers: ['android'],
          artifacts: { sourceDir: '/static' },
          git: {} as any,
          log,
          ports: makeAndroidPorts(),
        })
      ).rejects.toMatchObject({
        name: 'PreparePhaseError',
        category: 'invalid-android-artifact',
        message: expect.stringContaining('x86_64'),
      });
    });

    it('throws PreparePhaseError when APK has multiple ARM ABIs but no x86_64', async () => {
      mockApkEntries(['lib/armeabi-v7a/libnative.so', 'lib/arm64-v8a/libnative.so']);
      const log = new TestLogger();
      await expect(
        runPreparePhase({
          options: {} as Options,
          env: baseEnvironment,
          isReactNativeApp: true,
          browsers: ['android'],
          artifacts: { sourceDir: '/static' },
          git: {} as any,
          log,
          ports: makeAndroidPorts(),
        })
      ).rejects.toMatchObject({
        name: 'PreparePhaseError',
        category: 'invalid-android-artifact',
      });
    });
  });
});
