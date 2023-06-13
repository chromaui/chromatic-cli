// Double inversion on Promise.all means fulfilling with the first fulfilled promise, or rejecting
// when _everything_ rejects. This is different from Promise.race, which immediately rejects on the
// first rejection.
const invert = (promise: Promise<any>) =>
  new Promise<any>((resolve, reject) => promise.then(reject, resolve));

export const raceFulfilled = <T>(promises: Promise<T>[]): Promise<T> =>
  invert(Promise.all(promises.map(invert)).then((arr) => arr[0]));

export const timeout = (ms: number) =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('Timeout while resolving Storybook view layer package')), ms);
  });
