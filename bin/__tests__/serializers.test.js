import { execSync } from 'child_process';

import { errSerializer } from '../io/serializers';

it('strips off envPairs', () => {
  try {
    execSync('some hot garbage');
  } catch (err) {
    expect(errSerializer(err).envPairs).toBeUndefined();
  }
});

it('does not add random things to the error', () => {
  const err = new Error('error');
  expect(errSerializer(err).options).toBeUndefined();
});
