// A
// | \
// B  C
// |  |
// D  E
// |  |
// F  G
// | /
// H

// [commit, parent(s)]
export default [
  // prettier-ignore
  ['A', false],
  ['B', 'A'],
  ['C', 'A'],
  ['D', 'B'],
  ['E', 'C'],
  ['F', 'D'],
  ['G', 'E'],
  ['H', ['F', 'G']],
];
