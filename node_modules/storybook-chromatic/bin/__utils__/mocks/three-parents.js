//   A
//  /|\
// B C D
//  \|/
//   E

// [commit, parent(s)]
export default [
  // prettier-ignore
  ['A', false],
  ['B', 'A'],
  ['C', 'A'],
  ['D', 'A'],
  ['E', ['B', 'C', 'D']],
];
