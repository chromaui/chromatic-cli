// A z
// |
// B
// |
// ...
// |
// Y
// |
// Z

const ACode = 'A'.charCodeAt(0);

// [commit, parent(s)]
export default [
  ['A', false],
  ['z', false],
  ...Array(25)
    .fill()
    .map((_, index) => [
      String.fromCharCode(index + 1 + ACode), // e.g. 'B'
      String.fromCharCode(index + ACode), // e.g. 'A'
    ]),
];
