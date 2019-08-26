// A B
// |
// C
// |
// D

// [commit, parent(s)]
export default [
  // prettier-ignore
  ['A', false],
  ['B', false],
  ['C', 'A'],
  ['D', 'C'],
];
