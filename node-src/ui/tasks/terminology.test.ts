import { describe, expect, it } from 'vitest';

import { Context } from '../../types';
import tracedAffectedFiles from '../messages/info/tracedAffectedFiles';
import { success as prepareSuccess, traced, tracing } from './prepare';
import { pending as snapshotPending } from './snapshot';
import { runOnlyFiles, runOnlyNames } from './verify';

const E2E_FLAVORS = [
  ['Playwright', { playwright: true }],
  ['Cypress', { cypress: true }],
  ['Vitest', { vitest: true }],
] as const;

function cases(storybookText: string, e2eText: string, files = ['a', 'b']) {
  return [
    { name: 'Storybook', options: {}, files, output: storybookText },
    ...E2E_FLAVORS.map(([name, options]) => ({ name, options, files, output: e2eText })),
  ];
}

describe('TurboSnap terminology', () => {
  it.each(
    cases(
      'Retrieving story files affected by recent changes',
      'Retrieving test files affected by recent changes'
    )
  )('tracing uses $name terminology', ({ options, files, output }) => {
    expect(tracing({ options, git: { changedFiles: files } } as Context).title).toBe(output);
  });

  it.each([
    ...cases(
      'Found 1 story file affected by recent changes',
      'Found 1 test file affected by recent changes',
      ['a']
    ),
    ...cases(
      'Found 2 story files affected by recent changes',
      'Found 2 test files affected by recent changes'
    ),
  ])('traced uses $name terminology: $output', ({ options, files, output }) => {
    expect(traced({ options, onlyStoryFiles: files } as Context).output).toBe(output);
  });

  it.each([
    ...cases(
      'Snapshots will be limited to 1 story file affected by recent changes',
      'Snapshots will be limited to 1 test file affected by recent changes',
      ['a']
    ),
    ...cases(
      'Snapshots will be limited to 2 story files affected by recent changes',
      'Snapshots will be limited to 2 test files affected by recent changes'
    ),
  ])('runOnlyFiles uses $name terminology: $output', ({ options, files, output }) => {
    expect(runOnlyFiles({ options, onlyStoryFiles: files } as Context).output).toBe(output);
  });

  it.each(
    cases(
      "Snapshots will be limited to story files matching 'src/**'",
      "Snapshots will be limited to test files matching 'src/**'"
    )
  )(
    'runOnlyFiles uses $name terminology for an explicit --only-story-files glob',
    ({ options, output }) => {
      expect(
        runOnlyFiles({ options: { ...options, onlyStoryFiles: ['src/**'] } } as Context).output
      ).toBe(output);
    }
  );

  it.each(
    cases(
      "Snapshots will be limited to stories matching 'Button/*'",
      "Snapshots will be limited to tests matching 'Button/*'"
    )
  )('runOnlyNames uses $name terminology', ({ options, output }) => {
    expect(
      runOnlyNames({ options: { ...options, onlyStoryNames: ['Button/*'] } } as Context).output
    ).toBe(output);
  });

  it.each(
    cases("Running 2 tests for stories matching 'Button/*'", "Running 2 tests matching 'Button/*'")
  )('snapshot pending uses $name terminology', ({ options, output }) => {
    const build = {
      actualTestCount: 2,
      testCount: 2,
      errorCount: 0,
      changeCount: 0,
      specCount: 2,
      componentCount: 1,
      actualCaptureCount: 2,
    };
    expect(
      snapshotPending({
        build,
        options: { ...options, onlyStoryNames: ['Button/*'] },
      } as Context).title
    ).toBe(output);
  });

  it.each([
    ...cases(
      'Traced 1 changed file to 1 affected story file',
      'Traced 1 changed file to 1 affected test file'
    ),
    ...cases('∟ [story index]', '∟ [test index]'),
  ])('tracedAffectedFiles uses $name terminology: $output', ({ options, output }) => {
    const message = tracedAffectedFiles(
      {
        options,
        turboSnap: { tracedPaths: new Set(['src/a.ts\nsrc/a.stories.ts']) },
      } as Context,
      {
        changedFiles: ['src/a.ts'],
        affectedModules: { 'src/a.stories.ts': ['src/a.stories.ts'] },
        modulesByName: {},
        normalize: (name: string) => name,
      }
    );

    expect(message).toContain(output);
  });

  it.each(
    cases(
      'Storybook files validated and prepared for upload',
      'Test suite files validated and prepared for upload'
    )
  )('prepare success uses $name terminology', ({ options, output }) => {
    expect(prepareSuccess({ options } as Context).output).toBe(output);
  });
});
