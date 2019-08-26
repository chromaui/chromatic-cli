// A
// |
// B
// |
// C
// | \
// D  E
// | /
// F

// [commit, parent(s)]
export default [
  // prettier-ignore
  ['A', false],
  ['B', 'A'],
  ['C', 'B'],
  ['D', 'C'],
  ['E', 'C'],
  ['F', ['D', 'E']],
];
