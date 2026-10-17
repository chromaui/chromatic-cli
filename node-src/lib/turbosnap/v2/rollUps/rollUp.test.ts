import { describe, expect, it } from 'vitest';

import { hashEntryIdentities, hashEntryIdentity, rollUpEntryHashes } from './rollUp';

// The function that hashes the bytes. We just return the input so the tests can assert on the exact
// bytes that reach the hash function. What matters here is the encoding, not xxhash itself.
function identity(input: string): string {
  return input;
}

describe('hashEntryIdentity', () => {
  it('encodes the key and the value as a JSON pair', () => {
    expect(hashEntryIdentity(['a.ts', 'H1'])).toBe('["a.ts","H1"]');
  });

  it('keeps two entries distinct when the same bytes split differently between key and value', () => {
    // The quotes record where the key ends, so a file at path `ab` hashing to `c` stays distinct
    // from one at `a` hashing to `bc`.
    expect(hashEntryIdentity(['ab', 'c'])).not.toBe(hashEntryIdentity(['a', 'bc']));
  });

  it('puts the key before the value', () => {
    // A swap would encode just as well, but every previously published hash would change.
    expect(hashEntryIdentity(['k', 'v'])).toBe('["k","v"]');
  });

  it('encodes an empty value distinctly from an absent one being empty too', () => {
    expect(hashEntryIdentity(['a.ts', ''])).toBe('["a.ts",""]');
  });
});

describe('hashEntryIdentities', () => {
  it('sorts entries so iteration order does not reach the hash', () => {
    const forwards = hashEntryIdentities([
      ['a.ts', 'H1'],
      ['b.ts', 'H2'],
    ]);
    const backwards = hashEntryIdentities([
      ['b.ts', 'H2'],
      ['a.ts', 'H1'],
    ]);

    expect(forwards).toBe(backwards);
  });

  it('distinguishes entry sets that split the same bytes differently', () => {
    expect(
      hashEntryIdentities([
        ['ab', 'c'],
        ['d', 'e'],
      ])
    ).not.toBe(
      hashEntryIdentities([
        ['a', 'bc'],
        ['d', 'e'],
      ])
    );
  });

  it('distinguishes entry sets that split the same bytes across the entry boundary', () => {
    // With no delimiter between entries these would collide: `a`+`xb` then `y`+`` concatenates to
    // the same bytes as `a`+`x` then `by`+``. The per-entry JSON encoding keeps them apart.
    expect(
      hashEntryIdentities([
        ['a', 'xb'],
        ['y', ''],
      ])
    ).not.toBe(
      hashEntryIdentities([
        ['a', 'x'],
        ['by', ''],
      ])
    );
  });

  it('distinguishes a renamed key from an unchanged one', () => {
    expect(hashEntryIdentities([['a.ts', 'H1']])).not.toBe(hashEntryIdentities([['b.ts', 'H1']]));
  });
});

describe('rollUpEntryHashes', () => {
  it('hashes the encoded entries', () => {
    expect(
      rollUpEntryHashes(
        [
          ['a.ts', 'H1'],
          ['b.ts', 'H2'],
        ],
        identity
      )
    ).toBe('["a.ts","H1"]["b.ts","H2"]');
  });
});
