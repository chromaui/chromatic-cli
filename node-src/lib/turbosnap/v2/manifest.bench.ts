import { deepStrictEqual } from 'assert';
import { bench, describe } from 'vitest';
import xxHashWasm from 'xxhash-wasm';

import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  rollUpFileHashes,
  TurboSnapFile,
} from './graph';
import { createStoryFileHasher } from './storyFileHasher';

type HashString = (input: string) => string;
type GraphShape = 'sparse' | 'shared';

interface Workload {
  files: Map<FilePath, TurboSnapFile>;
  hashes: Map<FilePath, FileHash>;
  storyFiles: Set<FilePath>;
}

function addFile(
  workload: Workload,
  filePath: FilePath,
  dependencies: FilePath[],
  hashString: HashString
) {
  const hash = hashString(`source content for ${filePath}`);
  workload.files.set(filePath, { hash, dependencies: new Set(dependencies) });
  workload.hashes.set(filePath, hash);
}

function addLayers(
  workload: Workload,
  directory: string,
  count: number,
  externalDependencies: FilePath[],
  hashString: HashString
): FilePath {
  for (let index = 0; index < count; index += 1) {
    const dependencies = [...externalDependencies];
    if (index + 1 < count) dependencies.push(`${directory}/module-${index + 1}.ts`);
    if (index + 3 < count) dependencies.push(`${directory}/module-${index + 3}.ts`);
    addFile(workload, `${directory}/module-${index}.ts`, dependencies, hashString);
  }
  return `${directory}/module-0.ts`;
}

function createWorkload(storyCount: number, shape: GraphShape, hashString: HashString): Workload {
  const workload: Workload = {
    files: new Map(),
    hashes: new Map(),
    storyFiles: new Set(),
  };
  const featureRoots: FilePath[] = [];
  if (shape === 'shared') {
    const sharedRoot = addLayers(workload, './src/shared', 256, [], hashString);
    for (let group = 0; group < Math.min(storyCount, 16); group += 1) {
      featureRoots.push(
        addLayers(workload, `./src/features/group-${group}`, 32, [sharedRoot], hashString)
      );
    }
  }

  for (let index = 0; index < storyCount; index += 1) {
    const externalDependencies =
      featureRoots.length > 0 ? [featureRoots[index % featureRoots.length]] : [];
    const component = addLayers(
      workload,
      `./src/components/component-${index}`,
      3,
      externalDependencies,
      hashString
    );
    const storyFile = `./src/stories/Component-${index}.stories.tsx`;
    addFile(workload, storyFile, [component], hashString);
    workload.storyFiles.add(storyFile);
  }
  return workload;
}

async function originalStoryHashes({ files, hashes, storyFiles }: Workload) {
  const { h64ToString } = await xxHashWasm();
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    const dependencies = collectTransitiveDependencies(files, storyFile);
    storyFileHashes.set(storyFile, rollUpFileHashes(hashes, dependencies, h64ToString));
  }
  return storyFileHashes;
}

async function optimizedStoryHashes({ files, hashes, storyFiles }: Workload) {
  const xxhash = await xxHashWasm();
  const hashStoryFile = createStoryFileHasher(files, hashes, storyFiles, xxhash);
  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    storyFileHashes.set(storyFile, hashStoryFile(storyFile));
  }
  return storyFileHashes;
}

// Input construction is outside timing: this measures roll-ups from an already parsed graph.
// Each iteration includes WASM initialization and all manifest-scoped factory/cache setup.
// Sparse graphs have no overlap between stories; shared graphs mix local, feature and common code.
const { h64ToString } = await xxHashWasm();
const shapes: GraphShape[] = ['sparse', 'shared'];
const options = { time: 1000, iterations: 20, warmupTime: 100, warmupIterations: 2 };

for (const shape of shapes) {
  for (const storyCount of [10, 100, 1000, 2000]) {
    const workload = createWorkload(storyCount, shape, h64ToString);

    // Verify complete hash maps before registering timings, using the real hash implementation.
    deepStrictEqual(await optimizedStoryHashes(workload), await originalStoryHashes(workload));

    describe(`${shape}: ${storyCount} story files, ${workload.files.size} files`, () => {
      bench(
        'original traversal and roll-up',
        async () => {
          await originalStoryHashes(workload);
        },
        options
      );
      bench(
        'manifest-scoped story hasher',
        async () => {
          await optimizedStoryHashes(workload);
        },
        options
      );
    });
  }
}
