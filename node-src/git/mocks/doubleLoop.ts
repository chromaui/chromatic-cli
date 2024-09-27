// A
// | \
// B  C
// |  | \
// D  E  F
// |  | /
// G  H
// | /
// I

// [commit, parent(s)]
export default [
  // prettier-ignore
  ['A', false],
  ['B', 'A'],
  ['C', 'A'],
  ['D', 'B'],
  ['E', 'C'],
  ['F', 'C'],
  ['G', 'D'],
  ['H', 'E'],
  ['I', ['G', 'H']],
];
