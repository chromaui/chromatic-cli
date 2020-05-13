/* eslint-disable jest/no-try-expect */
import { execSync } from 'child_process';

import { errorSerializer } from './logSerializers';

it('strips off envPairs', () => {
  try {
    execSync('some hot garbage');
  } catch (err) {
    expect(errorSerializer(err).envPairs).toBeUndefined();
  }
});

it('does not add random things to the error', () => {
  const err = new Error('error');
  expect(errorSerializer(err).options).toBeUndefined();
});
