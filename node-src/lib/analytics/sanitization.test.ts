import { describe, expect, it } from 'vitest';

import { sanitizeStackTrace } from './sanitization';

describe('sanitizeStackTrace', () => {
  const cases: { name: string; input: string | undefined; expected: string }[] = [
    { name: 'undefined input', input: undefined, expected: '' },
    { name: 'empty string input', input: '', expected: '' },
    {
      name: 'redacts double-quoted content',
      input: 'Error: "secret value" found',
      expected: 'Error: <redacted> found',
    },
    {
      name: 'redacts backtick content',
      input: 'Error: `token abc` found',
      expected: 'Error: <redacted> found',
    },
    {
      name: 'preserves single-quoted content (apostrophes)',
      input: "Error: can't find module 'foo'",
      expected: "Error: can't find module 'foo'",
    },
    {
      name: 'redacts email addresses',
      input: 'Error: contact user.name+tag@example.co.uk for help',
      expected: 'Error: contact <email> for help',
    },
    {
      name: 'redacts home path preserving filename and :line:col',
      input: 'at fn ~/project/src/file.js:10:5',
      expected: 'at fn <path>/file.js:10:5',
    },
    {
      name: 'redacts home path preserving filename without line:col',
      input: 'at fn ~/project/src/file.js',
      expected: 'at fn <path>/file.js',
    },
    {
      name: 'redacts ~user home path preserving filename',
      input: 'at fn ~user/project/file.js:3:1',
      expected: 'at fn <path>/file.js:3:1',
    },
    {
      name: 'redacts unix absolute path preserving filename and :line:col',
      input: 'at fn /Users/user/project/file.js:42:7',
      expected: 'at fn <path>/file.js:42:7',
    },
    {
      name: 'redacts unix absolute path preserving filename without line:col',
      input: 'at fn /Users/user/project/file.js',
      expected: 'at fn <path>/file.js',
    },
    {
      name: 'redacts windows path preserving filename and :line:col',
      input: String.raw`at fn C:\Users\user\project\file.js:12:4`,
      expected: 'at fn <path>/file.js:12:4',
    },
    {
      name: 'redacts windows path preserving filename without line:col',
      input: String.raw`at fn D:\work\file.js`,
      expected: 'at fn <path>/file.js',
    },
    {
      name: 'preserves filename for single-segment absolute path',
      input: 'at fn /foo',
      expected: 'at fn <path>/foo', // not worth the regex complexity to handle this very unlikely weird case
    },
    {
      name: 'does not eat closing paren around path',
      input: 'at fn (/Users/alice/file.js:1:1)',
      expected: 'at fn (<path>/file.js:1:1)',
    },
    {
      name: 'handles multi-line stack trace without eating across lines',
      input: 'at x (/a/first.js:1:1)\n    at y (/b/second.js:2:2)',
      expected: 'at x (<path>/first.js:1:1)\n    at y (<path>/second.js:2:2)',
    },
    {
      name: 'caps input at 8000 chars before sanitization',
      input: 'a'.repeat(10_000),
      expected: 'a'.repeat(8000),
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(sanitizeStackTrace(input)).toBe(expected);
  });
});
