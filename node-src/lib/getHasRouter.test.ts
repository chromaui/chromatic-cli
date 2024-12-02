import { expect, it } from 'vitest';

import { getHasRouter } from './getHasRouter';

it('returns true if there is a routing package in package.json', async () => {
  expect(
    getHasRouter({
      dependencies: {
        react: '^18',
        'react-dom': '^18',
        'react-router': '^6',
      },
    })
  ).toBe(true);
});

it('sreturns false if there is a routing package in package.json dependenices', async () => {
  expect(
    getHasRouter({
      dependencies: {
        react: '^18',
        'react-dom': '^18',
      },
      devDependencies: {
        'react-router': '^6',
      },
    })
  ).toBe(false);
});
