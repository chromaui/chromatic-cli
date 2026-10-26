import { describe, expect, it, vi } from 'vitest';

import { getStatsScope } from './getStatsScope';

// Every file the stats name is in the checkout.
vi.mock('fs', () => ({ default: { existsSync: () => true } }));

// Resolve paths as Node does on Windows, where webpack and rspack can spell stats names with
// backslashes.
vi.mock('path', async () => {
  const { win32 } = await vi.importActual<typeof import('path')>('path');
  return { default: win32, ...win32 };
});

describe('getStatsScope on Windows', () => {
  const options = {
    rootPath: String.raw`C:\repo`,
    projectRoot: String.raw`C:\repo\packages\ui`,
    manifestPaths: ['package.json', 'packages/ui/package.json'],
  };

  it('recognizes installed packages spelled with backslashes', () => {
    const scope = getStatsScope(
      {
        modules: [
          { id: 1, name: './src/Button.tsx' },
          {
            id: 2,
            name: String.raw`C:\repo\node_modules\react-dom\index.js`,
            reasons: [{ moduleName: './src/Button.tsx' }],
          },
          {
            id: 3,
            name: String.raw`C:\repo\node_modules\react\index.js`,
            reasons: [{ moduleName: String.raw`C:\repo\node_modules\react-dom\index.js` }],
          },
        ],
      },
      options
    );

    expect(scope.importersByPackage).toEqual(
      new Map([['react-dom', new Set(['packages/ui/package.json'])]])
    );
    expect(scope.unattributedPackages).toEqual(new Set(['react']));
  });

  it('does not attribute an importer on another drive to the repository', () => {
    const scope = getStatsScope(
      {
        modules: [
          { id: 1, name: './src/Button.tsx' },
          {
            id: 2,
            name: String.raw`C:\repo\node_modules\react\index.js`,
            reasons: [{ moduleName: String.raw`D:\elsewhere\plugin.js` }],
          },
        ],
      },
      options
    );

    expect(scope.importersByPackage).toEqual(new Map());
    expect(scope.unattributedPackages).toEqual(new Set(['react']));
  });
});
