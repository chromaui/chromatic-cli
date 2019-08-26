export function pluralize(n, noun, noNumber) {
  let pluralizedNoun = n === 1 ? noun : `${noun}s`;
  if (pluralizedNoun.endsWith('ys')) {
    pluralizedNoun = pluralizedNoun.replace(/ys$/, 'ies');
  }
  return noNumber ? pluralizedNoun : `${n} ${pluralizedNoun}`;
}
