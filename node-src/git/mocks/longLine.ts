// A z
// |
// B
// |
// ...
// |
// Y
// |
// Z

const ACode = 'A'.codePointAt(0);

// [commit, parent(s)]
export default [
  ['A', false],
  ['z', false],
  ...Array.from({ length: 25 }).map((_, index) => [
    String.fromCodePoint(index + 1 + ACode), // e.g. 'B'
    String.fromCodePoint(index + ACode), // e.g. 'A'
  ]),
];
