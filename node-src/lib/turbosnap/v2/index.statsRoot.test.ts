import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { Stats } from '../../../types';
import { traceChangedFiles } from './index';
import { realProjectFiles } from './projectFiles';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('../v1/captureBailException', () => ({
  captureBailException: vi.fn(() => 'sentry-event-id'),
}));

// The generated stories entry sits at the build's cwd, so the same spelling serves both layouts. Its
// importer reference drops the `./` prefix, exactly as builder 3.4.0 writes it.
const STORIES_ENTRY = 'storybook-stories.js';

// Hoisted builder cache entries, spelled from each layout's cwd.
const REPOSITORY_ROOT_CACHE_ENTRY =
  './node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js';
const PROJECT_ROOT_CACHE_ENTRY =
  '../../node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js';

// The lazy require-context the rsbuild builder generates in place of direct story imports. It is not
// a file on disk, and its directory prefix names no `node_modules` segment, so it counts as a context
// that excluded `node_modules`.
const CONTEXT_SUFFIX = String.raw`|lazy|/^\.\/.*$/|include: /(?!.*node_modules)stories/|exclude: /[\\/]node_modules[\\/]/|namespace object`;
const REPOSITORY_ROOT_CONTEXT = `./packages/ui/src${CONTEXT_SUFFIX}`;
const PROJECT_ROOT_CONTEXT = `./src${CONTEXT_SUFFIX}`;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('traceChangedFiles stats root', () => {
  it('uploads project-relative story keys when rsbuild names modules from the repository root', async () => {
    const { runQuery } = await trace(
      stats({
        story: './packages/ui/src/Button.stories.tsx',
        context: REPOSITORY_ROOT_CONTEXT,
        entry: STORIES_ENTRY,
        dependency: './node_modules/react/index.js',
      })
    );

    expect(uploadedStoryFileHashes(runQuery)).toEqual({
      './src/Button.stories.tsx': expect.any(String),
    });
  });

  it('keeps project-root-relative stats on the project root', async () => {
    const { runQuery } = await trace(
      stats({
        story: './src/Button.stories.tsx',
        context: PROJECT_ROOT_CONTEXT,
        entry: STORIES_ENTRY,
        dependency: '../../node_modules/react/index.js',
      })
    );

    expect(uploadedStoryFileHashes(runQuery)).toEqual({
      './src/Button.stories.tsx': expect.any(String),
    });
  });

  it('bails when source modules resolve under neither known root', async () => {
    const { result, runQuery } = await trace(
      stats({
        story: './packages/ui/src/Missing.stories.tsx',
        context: REPOSITORY_ROOT_CONTEXT,
        entry: STORIES_ENTRY,
        dependency: './node_modules/react/index.js',
      })
    );

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: { anchorMismatch: true, bailSubreason: 'unresolvedSourceModules' },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('recognizes a hoisted builder cache entry on a repository-root build', async () => {
    const { runQuery } = await trace(
      stats({
        story: './packages/ui/src/Button.stories.tsx',
        context: REPOSITORY_ROOT_CONTEXT,
        entry: REPOSITORY_ROOT_CACHE_ENTRY,
        dependency: './node_modules/react/index.js',
      })
    );

    expect(uploadedStoryFileHashes(runQuery)).toEqual({
      './src/Button.stories.tsx': expect.any(String),
    });
  });

  // The catalogue holds raw builder spellings, so the same physical hoisted entry is recognized from
  // a repository-root build and refused from a package-directory build.
  it('refuses a hoisted builder cache entry on a package-directory build', async () => {
    const { result, runQuery } = await trace(
      stats({
        story: './src/Button.stories.tsx',
        context: PROJECT_ROOT_CONTEXT,
        entry: PROJECT_ROOT_CACHE_ENTRY,
        dependency: '../../node_modules/react/index.js',
      })
    );

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: { unrecognizedStoryEntry: true, sentryEventId: 'sentry-event-id' },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
  });
});

interface StoryChain {
  /** The story module's own name. */
  story: string;
  /** The lazy require-context that imports the story. */
  context: string;
  /** The generated entry that imports the context. */
  entry: string;
  /** A `node_modules` module the story imports. */
  dependency: string;
}

function stats({ story, context, entry, dependency }: StoryChain): Stats {
  return {
    modules: [
      { id: 1, name: story, reasons: [{ moduleName: context }] },
      { id: 2, name: context, reasons: [{ moduleName: entry }] },
      { id: 3, name: dependency, reasons: [{ moduleName: story }] },
    ],
  };
}

async function trace(statsInput: Stats) {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'chromatic-stats-root-'));
  temporaryDirectories.push(repositoryRoot);
  const projectRoot = path.join(repositoryRoot, 'packages/ui');
  const statsPath = path.join(projectRoot, 'storybook-static/preview-stats.json');
  const manifestOutputDirectory = path.join(projectRoot, '.chromatic');

  write(projectRoot, 'package.json', '{}');
  write(projectRoot, '.storybook/main.ts', 'export default {};');
  write(projectRoot, 'src/Button.stories.tsx', 'export default {};');
  write(repositoryRoot, 'node_modules/react/index.js', 'export const createElement = () => {};');
  write(
    repositoryRoot,
    'node_modules/storybook/package.json',
    '{"name":"storybook","version":"10.6.0"}'
  );
  write(projectRoot, 'storybook-static/preview-stats.json', '{}');
  mkdirSync(manifestOutputDirectory, { recursive: true });

  const runQuery = vi.fn().mockResolvedValue({
    buildUploadHashes: {
      build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' },
    },
  });

  const result = await traceChangedFiles({
    graphqlClient: { runQuery } as unknown as GraphQLClient,
    buildId: 'build-id',
    stats: statsInput,
    statsPath,
    manifestOutputDirectory,
    repositoryRoot,
    projectRoot,
    configDir: '.storybook',
    staticDirs: [],
    staticDirsDeclared: false,
    projectFiles: realProjectFiles(),
    builderName: 'storybook-react-rsbuild',
  });

  return { result, runQuery };
}

function uploadedStoryFileHashes(runQuery: ReturnType<typeof vi.fn>) {
  return runQuery.mock.calls[0]?.[1]?.input?.storyFileHashes;
}

function write(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}
