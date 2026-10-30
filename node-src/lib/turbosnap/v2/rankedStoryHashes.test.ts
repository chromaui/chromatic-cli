import { describe, expect, it } from 'vitest';
import xxhashWasm from 'xxhash-wasm';

import {
  collectTransitiveDependencies,
  rollUpFileHashes,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';
import { tryRankedStoryHashes } from './rankedStoryHashes';

describe('tryRankedStoryHashes', () => {
  it('hashes exactly the original bytes for overlapping stories across word boundaries', async () => {
    const xxhash = await xxhashWasm();
    const stories = Array.from({ length: 67 }, (_, index) => `story/${index}`);
    const shared = Array.from({ length: 150 }, (_, index) => `shared/${index}.js`);
    const files = new Map<string, TurboSnapFile>();
    const hashes = new Map<string, string>();
    function add(path: string, deps: string[], hash = path) {
      files.set(path, { hash, dependencies: new Set(deps) });
      hashes.set(path, hash);
    }

    // A skipped module still connects its importers to a cycle and a file absent from the graph.
    add('barrel', ['cycle', 'missing', ...shared], SKIPPED_HASH);
    add('cycle', ['barrel', 'quoted"\n', '😀', '\uE000']);
    // Some stories reach the barrel two steps later, after its dependencies were already visited.
    add('wrapper', ['intermediate']);
    add('intermediate', ['barrel']);
    for (const file of shared) add(file, []);
    for (const [index, story] of stories.entries()) {
      if (index === 0) add(story, [], SKIPPED_HASH);
      else add(story, [index % 2 ? 'wrapper' : 'barrel', `private/${index % 7}`, shared[index]]);
    }

    const expected = stories.map((story) =>
      Buffer.from(
        rollUpFileHashes(hashes, collectTransitiveDependencies(files, story), (input) => input)
      )
    );
    const actualInputs: Buffer[] = [];
    const result = tryRankedStoryHashes(files, hashes, new Set(stories), {
      h64Raw(bytes) {
        actualInputs.push(Buffer.from(bytes));
        return xxhash.h64Raw(bytes);
      },
    });
    expect(actualInputs).toEqual(expected);
    expect(result && [...result]).toEqual(
      stories.map((story, index) => [story, xxhash.h64ToString(expected[index].toString())])
    );
  });

  it('uses the ordinary story hasher when large subtrees share only a few imports', async () => {
    const stories = Array.from({ length: 128 }, (_, index) => `story/${index}`);
    const common = ['a', 'b', 'c', 'd', 'e'];
    const files = new Map(
      stories.map((story) => [
        story,
        {
          hash: story,
          dependencies: new Set([
            ...common,
            ...Array.from({ length: 150 }, (_, index) => `${story}/${index}`),
          ]),
        },
      ])
    );
    expect(
      tryRankedStoryHashes(files, new Map(), new Set(stories), await xxhashWasm())
    ).toBeUndefined();
  });
});
