import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GraphQLClient from '../../../io/graphqlClient';
import { Stats } from '../../../types';
import { traceChangedFiles } from './index';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('traceChangedFiles stats root', () => {
  it('uploads project-relative story keys when rsbuild names modules from the repository root', async () => {
    const { runQuery } = await trace(
      stats(
        'packages/ui/src/Button.stories.tsx',
        'packages/ui/storybook-stories.js',
        'node_modules/react/index.js'
      )
    );

    expect(uploadedStoryFileHashes(runQuery)).toEqual({
      './src/Button.stories.tsx': expect.any(String),
    });
  });

  it('keeps project-root-relative stats on the project root', async () => {
    const { runQuery } = await trace(
      stats(
        './src/Button.stories.tsx',
        './storybook-stories.js',
        '../../node_modules/react/index.js'
      )
    );

    expect(uploadedStoryFileHashes(runQuery)).toEqual({
      './src/Button.stories.tsx': expect.any(String),
    });
  });

  it('bails when source modules resolve under neither known root', async () => {
    const { result, runQuery } = await trace(
      stats(
        'packages/ui/src/Missing.stories.tsx',
        'packages/ui/storybook-stories.js',
        'node_modules/react/index.js'
      )
    );

    expect(result).toEqual({
      status: 'bailed',
      turboSnap: {
        bailReason: { anchorMismatch: true, bailSubreason: 'unresolvedSourceModules' },
      },
    });
    expect(runQuery).not.toHaveBeenCalled();
  });
});

function stats(storyName: string, storyImporter: string, dependencyName: string): Stats {
  return {
    modules: [
      { id: 1, name: storyName, reasons: [{ moduleName: storyImporter }] },
      {
        id: 2,
        name: dependencyName,
        reasons: [{ moduleName: storyName }],
      },
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
