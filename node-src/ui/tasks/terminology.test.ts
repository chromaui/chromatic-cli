import { describe, expect, it } from 'vitest';

import { Context } from '../../types';
import { success as prepareSuccess, traced, tracing } from './prepare';
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
      "Snapshots will be limited to stories matching 'Button/*'",
      "Snapshots will be limited to tests matching 'Button/*'"
    )
  )('runOnlyNames uses $name terminology', ({ options, output }) => {
    expect(
      runOnlyNames({ options: { ...options, onlyStoryNames: ['Button/*'] } } as Context).output
    ).toBe(output);
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
