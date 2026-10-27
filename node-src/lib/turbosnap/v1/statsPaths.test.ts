import { describe, expect, it } from 'vitest';

import { getVersionFromPath } from './statsPaths';

describe('getVersionFromPath', () => {
  it.each([
    ['node_modules/.pnpm/is-number@7.0.0/node_modules/is-number', 'is-number', '7.0.0'],
    [
      '../../node_modules/.pnpm/@storybook+react@10.6.1_react@19.2.8/node_modules/@storybook/react',
      '@storybook/react',
      '10.6.1',
    ],
    ['.pnpm/left-pad@1.3.0-rc.1/node_modules/left-pad', 'left-pad', '1.3.0-rc.1'],
    [
      '.yarn/cache/left-pad-npm-1.3.0-2ef5a3b3ba-11d5a3d4b6.zip/node_modules/left-pad',
      'left-pad',
      '1.3.0',
    ],
    [
      '.yarn/cache/@storybook-react-npm-10.6.1-beta.2-0123456789-abcdef0123.zip/node_modules/@storybook/react',
      '@storybook/react',
      '10.6.1-beta.2',
    ],
    ['node_modules/is-number', 'is-number', undefined],
  ])('reads %s', (directory, name, version) => {
    expect(getVersionFromPath(directory, name)).toBe(version);
  });
});
