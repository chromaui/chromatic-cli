import { execSync } from 'child_process';

import { errorSerializer } from './logSerializers';

it('strips off envPairs', () => {
  let err;
  try {
    execSync('some hot garbage', { stdio: 'ignore' });
  } catch (e) {
    err = e;
  }
  expect(errorSerializer(err).envPairs).toBeUndefined();
});

it('does not add random things to the error', () => {
  const err = new Error('error');
  expect(errorSerializer(err).options).toBeUndefined();
});
