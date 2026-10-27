/* eslint-disable max-lines */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

import { Context } from '../../../types';
import {
  createVersionLookup,
  findLoadedVersion,
  findNearestLockfile,
  LockfileVersions,
  readInstalledVersion,
  readLockfileVersions,
} from './lockfileVersions';

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../e2e/fixtures'
);
const readFixtureLockfile = (fixture: string, lockfilePath: string) =>
  readLockfileVersions(
    readFileSync(path.join(fixtures, fixture, lockfilePath), 'utf8'),
    lockfilePath
  );

// Every version of `name` the lockfile installs, whatever its format.
const versionsOf = (versions: LockfileVersions, name: string) =>
  versions.format === 'npm'
    ? new Set(
        [...versions.byPath]
          .filter(([directory]) => directory.endsWith(`node_modules/${name}`))
          .map(([, version]) => version)
      )
    : (versions.byName.get(name) ?? new Set());

describe('readLockfileVersions', () => {
  it.each([
    ['monorepo-npm', 'package-lock.json'],
    ['monorepo-yarn-classic', 'yarn.lock'],
    ['monorepo-yarn', 'yarn.lock'],
    ['monorepo-pnpm', 'pnpm-lock.yaml'],
  ])('reads the installed versions from the %s lockfile', (fixture, lockfilePath) => {
    const versions = readFixtureLockfile(fixture, lockfilePath);

    expect(versionsOf(versions, 'react')).toEqual(new Set(['19.2.8']));
    expect(versionsOf(versions, 'scheduler')).toEqual(new Set(['0.27.0']));
    expect(versionsOf(versions, '@storybook/react')).toEqual(new Set(['10.6.1']));
    expect(versions.notFromRegistry.has('react')).toBe(false);
    // Workspaces are links, not installed copies. Yarn 1 doesn't list them at all.
    expect(versionsOf(versions, '@myorg/shared')).toEqual(new Set());
    if (fixture !== 'monorepo-yarn-classic') {
      expect(versions.notFromRegistry.has('@myorg/shared')).toBe(true);
    }
  });

  it('records where npm installed each copy, relative to the repository root', () => {
    const lockfile = JSON.stringify({
      packages: {
        '': {},
        'node_modules/is-number': { version: '7.0.0' },
        'packages/ui/node_modules/is-number': { version: '6.0.0' },
        'node_modules/@myorg/ui': { resolved: 'packages/ui', link: true },
      },
    });

    const versions = readLockfileVersions(lockfile, 'app/package-lock.json');
    expect(versions.format === 'npm' && Object.fromEntries(versions.byPath)).toEqual({
      'app/node_modules/is-number': '7.0.0',
      'app/packages/ui/node_modules/is-number': '6.0.0',
    });
  });

  it('reads pnpm keys from before v9, with a leading slash and peer suffixes', () => {
    const lockfile = [
      "lockfileVersion: '6.0'",
      'importers:',
      '  packages/ui: {}',
      'packages:',
      '  /react-dom@18.2.0(react@18.2.0):',
      '    resolution: {integrity: sha512-abc}',
      '  /@babel/core@7.24.0:',
      '    resolution: {integrity: sha512-def}',
      '    deprecated: Use @babel/core-next instead',
    ].join('\n');

    const versions = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    expect(versionsOf(versions, 'react-dom')).toEqual(new Set(['18.2.0']));
    expect(versionsOf(versions, '@babel/core')).toEqual(new Set(['7.24.0']));
    expect(versionsOf(versions, 'packages/ui')).toEqual(new Set());
    expect(versions.format !== 'npm' && [...versions.byName.keys()]).toEqual([
      'react-dom',
      '@babel/core',
    ]);
  });

  it('reads pnpm v5 keys, which separate the version with a slash', () => {
    const lockfile = [
      'lockfileVersion: 5.4',
      'packages:',
      '  /react-dom/18.2.0_react@18.2.0:',
      '  /@babel/core/7.24.0:',
    ].join('\n');

    const versions = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    expect(versionsOf(versions, 'react-dom')).toEqual(new Set(['18.2.0']));
    expect(versionsOf(versions, '@babel/core')).toEqual(new Set(['7.24.0']));
  });

  it('skips the Yarn Berry metadata block', () => {
    const lockfile = [
      '__metadata:',
      '  version: 8',
      '',
      '"left-pad@npm:^1.3.0":',
      '  version: 1.3.0',
      '  resolution: "left-pad@npm:1.3.0"',
    ].join('\n');

    const versions = readLockfileVersions(lockfile, 'yarn.lock');
    expect(versions.format !== 'npm' && [...versions.byName.keys()]).toEqual(['left-pad']);
  });
});

describe('readLockfileVersions notFromRegistry', () => {
  // What each package manager writes for a manifest with `is-number@7.0.0` from the registry, a git dependency `is-odd`, a `file:` dependency `local-pkg`, and an npm alias
  // `my-num` for `is-number@6.0.0`.
  it.each([
    [
      'package-lock.json',
      JSON.stringify({
        packages: {
          '': {},
          local: { name: 'local-pkg', version: '1.0.0' },
          'node_modules/is-number': {
            version: '7.0.0',
            resolved: 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',
          },
          'node_modules/is-odd': {
            version: '3.0.1',
            resolved: 'git+ssh://git@github.com/jonschlinkert/is-odd.git#a80ee0d',
          },
          'node_modules/local-pkg': { resolved: 'local', link: true },
          'node_modules/my-num': {
            name: 'is-number',
            version: '6.0.0',
            resolved: 'https://registry.npmjs.org/is-number/-/is-number-6.0.0.tgz',
          },
        },
      }),
    ],
    [
      'yarn.lock',
      [
        'is-number@7.0.0:',
        '  version "7.0.0"',
        '  resolved "https://registry.yarnpkg.com/is-number/-/is-number-7.0.0.tgz#7535345b896734d5f80c4d06c50955527a14f12b"',
        '  integrity sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==',
        '',
        'is-number@^6.0.0:',
        '  version "6.0.0"',
        '  resolved "https://registry.yarnpkg.com/is-number/-/is-number-6.0.0.tgz#e6d15ad31fc262887cccf217ae5f9316f81b1995"',
        '  integrity sha512-Wu1VHeILBK8KAWJUAiSZQX94GmOE45Rg6/538fKwiloUu21KncEkYGPqob2oSZ5mUT73vLGrHQjKw3KMPwfDzg==',
        '',
        '"is-odd@github:jonschlinkert/is-odd#3.0.1":',
        '  version "3.0.1"',
        '  resolved "https://codeload.github.com/jonschlinkert/is-odd/tar.gz/a80ee0d831a8ee69f1fad5b4673491847975eb26"',
        '  dependencies:',
        '    is-number "^6.0.0"',
        '',
        '"local-pkg@file:./local":',
        '  version "1.0.0"',
        '',
        '"my-num@npm:is-number@6.0.0":',
        '  version "6.0.0"',
        '  resolved "https://registry.yarnpkg.com/is-number/-/is-number-6.0.0.tgz#e6d15ad31fc262887cccf217ae5f9316f81b1995"',
        '  integrity sha512-Wu1VHeILBK8KAWJUAiSZQX94GmOE45Rg6/538fKwiloUu21KncEkYGPqob2oSZ5mUT73vLGrHQjKw3KMPwfDzg==',
      ].join('\n'),
    ],
    [
      'yarn.lock',
      [
        '__metadata:',
        '  version: 8',
        '  cacheKey: 10c0',
        '',
        '"exp@workspace:.":',
        '  version: 0.0.0-use.local',
        '  resolution: "exp@workspace:."',
        '  dependencies:',
        '    is-number: "npm:7.0.0"',
        '    is-odd: "github:jonschlinkert/is-odd#3.0.1"',
        '    local-pkg: "file:./local"',
        '    my-num: "npm:is-number@6.0.0"',
        '  languageName: unknown',
        '  linkType: soft',
        '',
        '"is-number@npm:7.0.0":',
        '  version: 7.0.0',
        '  resolution: "is-number@npm:7.0.0"',
        '  checksum: 10c0/b4686d0d3053146095ccd45346461bc8e53b80aeb7671cc52a4de02dbbf7dc0d1d2a986e2fe4ae206984b4d34ef37e8b795ebc4f4295c978373e6575e295d811',
        '  languageName: node',
        '  linkType: hard',
        '',
        '"is-number@npm:^6.0.0, my-num@npm:is-number@6.0.0":',
        '  version: 6.0.0',
        '  resolution: "is-number@npm:6.0.0"',
        '  checksum: 10c0/5da4c68401529675c575878d2760d66f18eaef4b014858577f6003daf66488d7fe4eae684b1e8574e3fa1bb447c6c6c56b8491d2b4b3239da2d32e5f6f218008',
        '  languageName: node',
        '  linkType: hard',
        '',
        '"is-odd@github:jonschlinkert/is-odd#3.0.1":',
        '  version: 3.0.1',
        '  resolution: "is-odd@https://github.com/jonschlinkert/is-odd.git#commit=a80ee0d831a8ee69f1fad5b4673491847975eb26"',
        '  dependencies:',
        '    is-number: "npm:^6.0.0"',
        '  checksum: 10c0/2fae6e111f8b5a4aabe75786ede6477d666c693bd062da5dc29c7d8ab02e41e2650653114f68eaa03db377b2da84f5f0a8983dfb48cf8184b4ffb80bf825496e',
        '  languageName: node',
        '  linkType: hard',
        '',
        '"local-pkg@file:./local::locator=exp%40workspace%3A.":',
        '  version: 1.0.0',
        '  resolution: "local-pkg@file:./local#./local::hash=dde476&locator=exp%40workspace%3A."',
        '  checksum: 10c0/32c096833a26986bca893b508af8aea788c21182256ff3deae1a1a81e8f9531681d1ba4f61602ba8062a6eb5be2c00f105c4180af13e844cf1a516168a3a8fa7',
        '  languageName: node',
        '  linkType: hard',
      ].join('\n'),
    ],
    [
      'pnpm-lock.yaml',
      [
        "lockfileVersion: '9.0'",
        '',
        'settings:',
        '  autoInstallPeers: true',
        '  excludeLinksFromLockfile: false',
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        '      is-number:',
        '        specifier: 7.0.0',
        '        version: 7.0.0',
        '      is-odd:',
        '        specifier: github:jonschlinkert/is-odd#3.0.1',
        '        version: git+https://git@github.com:jonschlinkert/is-odd.git#a80ee0d831a8ee69f1fad5b4673491847975eb26',
        '      local-pkg:',
        '        specifier: file:./local',
        '        version: file:local',
        '      my-num:',
        '        specifier: npm:is-number@6.0.0',
        '        version: is-number@6.0.0',
        '',
        'packages:',
        '',
        '  is-number@6.0.0:',
        '    resolution: {integrity: sha512-Wu1VHeILBK8KAWJUAiSZQX94GmOE45Rg6/538fKwiloUu21KncEkYGPqob2oSZ5mUT73vLGrHQjKw3KMPwfDzg==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        '  is-number@7.0.0:',
        '    resolution: {integrity: sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==}',
        "    engines: {node: '>=0.12.0'}",
        '',
        '  is-odd@git+https://git@github.com:jonschlinkert/is-odd.git#a80ee0d831a8ee69f1fad5b4673491847975eb26:',
        '    resolution: {commit: a80ee0d831a8ee69f1fad5b4673491847975eb26, repo: git@github.com:jonschlinkert/is-odd.git, type: git}',
        '    version: 3.0.1',
        "    engines: {node: '>=4'}",
        '',
        '  local-pkg@file:local:',
        '    resolution: {directory: local, type: directory}',
        '',
        'snapshots:',
        '',
        '  is-number@6.0.0: {}',
        '',
        '  is-number@7.0.0: {}',
        '',
        '  is-odd@git+https://git@github.com:jonschlinkert/is-odd.git#a80ee0d831a8ee69f1fad5b4673491847975eb26:',
        '    dependencies:',
        '      is-number: 6.0.0',
        '',
        '  local-pkg@file:local: {}',
      ].join('\n'),
    ],
  ])('lists git, file and aliased packages from %s', (lockfilePath, lockfile) => {
    const versions = readLockfileVersions(lockfile, lockfilePath);
    const { notFromRegistry } = versions;

    expect(notFromRegistry.has('is-odd')).toBe(true);
    expect(notFromRegistry.has('is-number')).toBe(false);
    expect(versionsOf(versions, 'is-number').has('7.0.0')).toBe(true);
    // npm lists `file:` packages as links.
    expect(notFromRegistry.has('my-num')).toBe(true);
    expect(notFromRegistry.has('local-pkg')).toBe(true);
  });
  // Aliases a version check alone can't catch, from real installs: Yarn 1 installs
  // `"is": "npm:@sindresorhus/is@4.6.0"` from a tarball whose file name matches an unscoped `is`, and
  // pnpm's hoisted linker puts `"is-number": "npm:is-odd@3.0.1"` in `node_modules/is-number` while
  // its lockfile also installs a real is-number. A pnpm v5 project lists its `link:` dependency at
  // the top level.
  it.each([
    [
      'yarn.lock',
      'is',
      [
        'is-number@7.0.0:',
        '  version "7.0.0"',
        '  resolved "https://registry.yarnpkg.com/is-number/-/is-number-7.0.0.tgz#7535345b896734d5f80c4d06c50955527a14f12b"',
        '  integrity sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==',
        '',
        '"is@npm:@sindresorhus/is@4.6.0":',
        '  version "4.6.0"',
        '  resolved "https://registry.yarnpkg.com/@sindresorhus/is/-/is-4.6.0.tgz#3c7c9c46e678feefe7a2e5bb609d3dbd665ffb3f"',
        '  integrity sha512-t09vSN3MdfsyCHoFcTRCH/iUtG7OJ0CsjzB8cjAmKc/va/kIgeDI/TxsigdncE/4be734m0cvIYwNaV4i2XqAw==',
      ].join('\n'),
    ],
    [
      'pnpm-lock.yaml',
      'is-number',
      [
        "lockfileVersion: '9.0'",
        '',
        'settings:',
        '  autoInstallPeers: true',
        '  excludeLinksFromLockfile: false',
        '',
        'importers:',
        '',
        '  .:',
        '    dependencies:',
        '      is-even:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        '      is-number:',
        '        specifier: npm:is-odd@3.0.1',
        '        version: is-odd@3.0.1',
        '',
        'packages:',
        '',
        '  is-buffer@1.1.6:',
        '    resolution: {integrity: sha512-NcdALwpXkTm5Zvvbk7owOUSvVvBKDgKP5/ewfXEznmQFfs4ZRmanOeKBTjRVjka3QFoN6XJ+9F3USqfHqTaU5w==}',
        '',
        '  is-even@1.0.0:',
        '    resolution: {integrity: sha512-LEhnkAdJqic4Dbqn58A0y52IXoHWlsueqQkKfMfdEnIYG8A1sm/GHidKkS6yvXlMoRrkM34csHnXQtOqcb+Jzg==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        '  is-number@3.0.0:',
        '    resolution: {integrity: sha512-4cboCqIpliH+mAvFNegjZQ4kgKc3ZUhQVr3HvWbSh5q3WH2v82ct+T2Y1hdU5Gdtorx/cLifQjqCbL7bpznLTg==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        '  is-number@6.0.0:',
        '    resolution: {integrity: sha512-Wu1VHeILBK8KAWJUAiSZQX94GmOE45Rg6/538fKwiloUu21KncEkYGPqob2oSZ5mUT73vLGrHQjKw3KMPwfDzg==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        '  is-odd@0.1.2:',
        '    resolution: {integrity: sha512-Ri7C2K7o5IrUU9UEI8losXJCCD/UtsaIrkR5sxIcFg4xQ9cRJXlWA5DQvTE0yDc0krvSNLsRGXN11UPS6KyfBw==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        '  is-odd@3.0.1:',
        '    resolution: {integrity: sha512-CQpnWPrDwmP1+SMHXZhtLtJv90yiyVfluGsX5iNCVkrhQtU3TQHsUWPG9wkdk9Lgd5yNpAg9jQEo90CBaXgWMA==}',
        "    engines: {node: '>=4'}",
        '',
        '  kind-of@3.2.2:',
        '    resolution: {integrity: sha512-NOW9QQXMoZGg/oqnVNoNTTIFEIid1627WCffUBJEdMxYApq7mNE7CpzucIPc+ZQg25Phej7IJSmX3hO+oblOtQ==}',
        "    engines: {node: '>=0.10.0'}",
        '',
        'snapshots:',
        '',
        '  is-buffer@1.1.6: {}',
        '',
        '  is-even@1.0.0:',
        '    dependencies:',
        '      is-odd: 0.1.2',
        '',
        '  is-number@3.0.0:',
        '    dependencies:',
        '      kind-of: 3.2.2',
        '',
        '  is-number@6.0.0: {}',
        '',
        '  is-odd@0.1.2:',
        '    dependencies:',
        '      is-number: 3.0.0',
        '',
        '  is-odd@3.0.1:',
        '    dependencies:',
        '      is-number: 6.0.0',
        '',
        '  kind-of@3.2.2:',
        '    dependencies:',
        '      is-buffer: 1.1.6',
      ].join('\n'),
    ],
    [
      'pnpm-lock.yaml',
      'local-pkg',
      [
        'lockfileVersion: 5.4',
        '',
        'specifiers:',
        '  is-number: 7.0.0',
        '  local-pkg: link:./local',
        '',
        'dependencies:',
        '  is-number: 7.0.0',
        '  local-pkg: link:local',
        '',
        'packages:',
        '',
        '  /is-number/7.0.0:',
        '    resolution: {integrity: sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==}',
        "    engines: {node: '>=0.12.0'}",
        '    dev: false',
      ].join('\n'),
    ],
  ])('lists the alias or link in %s under %s', (lockfilePath, name, lockfile) => {
    expect(readLockfileVersions(lockfile, lockfilePath).notFromRegistry).toEqual(new Set([name]));
  });

  it('lists packages pnpm patches', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      'patchedDependencies:',
      '  is-number@7.0.0:',
      '    hash: abc123',
      '    path: patches/is-number@7.0.0.patch',
      '  is-odd: def456',
      'packages:',
      '  is-number@7.0.0:',
      '  is-even@1.0.0:',
      'snapshots:',
      '  is-number@7.0.0(patch_hash=abc123): {}',
      "  '/is-even@1.0.0(patch_hash=789)':",
    ].join('\n');

    const { notFromRegistry } = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    expect(notFromRegistry).toEqual(new Set(['is-number', 'is-odd', 'is-even']));
  });

  it('lists workspace links from pnpm lockfiles before v6, which inline the version', () => {
    const lockfile = [
      "lockfileVersion: '5.4'",
      'importers:',
      '  packages/ui:',
      '    dependencies:',
      "      '@myorg/shared': link:../shared",
      '      is-number: 7.0.0',
    ].join('\n');

    const { notFromRegistry } = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    expect(notFromRegistry).toEqual(new Set(['@myorg/shared']));
  });

  it('lists packages npm installs from a tarball URL outside the registry, or under an alias', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/is-number': {
          version: '7.0.0',
          resolved: 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',
        },
        'node_modules/is-odd': { version: '3.0.1', resolved: 'https://example.com/is-odd.tgz' },
        // Another package's tarball, though the file name matches.
        'node_modules/is-even': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/forks/-/is-even-1.0.0.tgz',
        },
        // npm leaves out `resolved` with `omit-lockfile-registry-resolved`.
        'node_modules/my-num': { name: 'is-number', version: '6.0.0' },
      },
    });

    const { notFromRegistry } = readLockfileVersions(lockfile, 'package-lock.json');
    expect(notFromRegistry).toEqual(new Set(['is-odd', 'is-even', 'my-num']));
  });

  it('lists aliases among the dependencies of pnpm packages', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      'packages:',
      '  is-even@1.0.0:',
      '    resolution: {integrity: sha512-abc}',
      '  is-number@6.0.0:',
      '    resolution: {integrity: sha512-def}',
      'snapshots:',
      '  is-even@1.0.0:',
      '    dependencies:',
      '      is-odd: is-number@6.0.0',
      '  is-number@6.0.0: {}',
    ].join('\n');

    const { notFromRegistry } = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    expect(notFromRegistry).toEqual(new Set(['is-odd']));
  });

  it('lists git and tarball packages from pnpm lockfiles before v9, which key them by URL', () => {
    const lockfile = [
      "lockfileVersion: '6.0'",
      'packages:',
      '  /is-number@7.0.0:',
      '    resolution: {integrity: sha512-abc}',
      '  github.com/jonschlinkert/is-number/98e8ff1:',
      '    resolution: {tarball: https://codeload.github.com/jonschlinkert/is-number/tar.gz/98e8ff1}',
      '    name: is-number',
      '    version: 6.0.0',
    ].join('\n');

    const versions = readLockfileVersions(lockfile, 'pnpm-lock.yaml');
    const { notFromRegistry } = versions;
    expect(notFromRegistry).toEqual(new Set(['is-number']));
    expect(versionsOf(versions, 'is-number')).toEqual(new Set(['7.0.0']));
  });
});

// Lockfile versions as `readLockfileVersions` returns them.
const npmLockfile = (byPath: Record<string, string>): LockfileVersions => ({
  format: 'npm',
  byPath: new Map(Object.entries(byPath)),
  notFromRegistry: new Set(),
});
const yarnLockfile = (byName: Record<string, string[]>): LockfileVersions => ({
  format: 'yarn',
  byName: new Map(Object.entries(byName).map(([name, versions]) => [name, new Set(versions)])),
  notFromRegistry: new Set(),
});

describe('findNearestLockfile', () => {
  const lockfilePaths = ['package-lock.json', 'frontend/package-lock.json'];

  it('picks the nearest lockfile above the package', () => {
    expect(findNearestLockfile(lockfilePaths, 'frontend/node_modules/foo')).toBe(
      'frontend/package-lock.json'
    );
    // `frontend-old` isn't inside `frontend`, and a copy hoisted to the root belongs to the root.
    expect(findNearestLockfile(lockfilePaths, 'frontend-old/node_modules/foo')).toBe(
      'package-lock.json'
    );
    expect(findNearestLockfile(lockfilePaths, 'node_modules/foo')).toBe('package-lock.json');
    // A shorter path can still be the nearer lockfile.
    expect(findNearestLockfile(['pnpm-lock.yaml', 'ui/yarn.lock'], 'ui/node_modules/foo')).toBe(
      'ui/yarn.lock'
    );
  });

  it('finds none for a package outside the repository', () => {
    expect(findNearestLockfile(lockfilePaths, '../node_modules/foo')).toBeUndefined();
    expect(findNearestLockfile(lockfilePaths, '/cache/node_modules/foo')).toBeUndefined();
  });
});

describe('findLoadedVersion', () => {
  it('takes the npm copy at that path, and nothing else from an npm lockfile', () => {
    const npm = npmLockfile({ 'node_modules/is-number': '7.0.0' });
    expect(findLoadedVersion(npm, 'node_modules/is-number', 'is-number')).toBe('7.0.0');
    // A copy npm didn't install at that path wasn't installed by this lockfile.
    expect(findLoadedVersion(npm, 'packages/ui/node_modules/is-number', 'is-number')).toBe(
      undefined
    );
  });

  it('takes the only version a lockfile installs, and leaves several unknown', () => {
    const yarn = yarnLockfile({ react: ['19.2.8'], 'is-number': ['6.0.0', '7.0.0'] });
    expect(findLoadedVersion(yarn, 'node_modules/react', 'react')).toBe('19.2.8');
    expect(findLoadedVersion(yarn, 'node_modules/is-number', 'is-number')).toBeUndefined();
    expect(findLoadedVersion(yarn, 'node_modules/missing', 'missing')).toBeUndefined();
  });

  it('prefers the version in the path', () => {
    const directory = 'node_modules/.pnpm/is-number@7.0.0/node_modules/is-number';
    const yarn = yarnLockfile({ 'is-number': ['6.0.0'] });
    expect(findLoadedVersion(yarn, directory, 'is-number')).toBe('7.0.0');
  });
});

describe('readInstalledVersion', () => {
  it('reads a copy in the repository, and nothing outside it', () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'chromatic-'));
    try {
      for (const directory of ['repo/node_modules/is-number', 'outside/node_modules/is-number']) {
        mkdirSync(path.join(temporary, directory), { recursive: true });
        writeFileSync(
          path.join(temporary, directory, 'package.json'),
          '{"name":"is-number","version":"7.0.0"}'
        );
      }
      const rootPath = path.join(temporary, 'repo');

      expect(readInstalledVersion(rootPath, 'node_modules/is-number', 'is-number')).toBe('7.0.0');
      expect(
        readInstalledVersion(rootPath, '../outside/node_modules/is-number', 'is-number')
      ).toBeUndefined();
      expect(
        readInstalledVersion(
          rootPath,
          path.join(temporary, 'outside/node_modules/is-number'),
          'is-number'
        )
      ).toBeUndefined();
      // An alias's directory holds another package.
      expect(readInstalledVersion(rootPath, 'node_modules/is-number', 'is-odd')).toBeUndefined();
      // A symlink is a workspace or a `link:` dependency, which Yarn 1 doesn't record.
      mkdirSync(path.join(rootPath, 'packages/is-odd'), { recursive: true });
      writeFileSync(
        path.join(rootPath, 'packages/is-odd/package.json'),
        '{"name":"is-odd","version":"1.0.0"}'
      );
      symlinkSync('../packages/is-odd', path.join(rootPath, 'node_modules/is-odd'));
      expect(readInstalledVersion(rootPath, 'node_modules/is-odd', 'is-odd')).toBeUndefined();
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});

describe('createVersionLookup', () => {
  it('only reads an npm copy from disk when its lockfile lists it', () => {
    const rootPath = mkdtempSync(path.join(os.tmpdir(), 'chromatic-'));
    const ctx = { log: { debug: vi.fn(), warn: vi.fn() } } as unknown as Context;
    try {
      mkdirSync(path.join(rootPath, 'node_modules/kind-of'), { recursive: true });
      writeFileSync(
        path.join(rootPath, 'node_modules/kind-of/package.json'),
        '{"name":"kind-of","version":"6.0.3"}'
      );
      const findVersion = (lockfile: object) => {
        writeFileSync(path.join(rootPath, 'package-lock.json'), JSON.stringify(lockfile));
        return createVersionLookup(ctx, rootPath, ['package-lock.json']).findVersion(
          'node_modules/kind-of',
          'kind-of'
        );
      };

      // A v1 lockfile has no install paths, so it doesn't say this git dependency isn't a registry copy.
      expect(
        findVersion({
          lockfileVersion: 1,
          dependencies: { 'kind-of': { version: 'github:jonschlinkert/kind-of#abc123' } },
        })
      ).toBeUndefined();
      expect(
        findVersion({
          lockfileVersion: 3,
          packages: {
            'node_modules/kind-of': {
              version: '6.0.3',
              resolved: 'https://registry.npmjs.org/kind-of/-/kind-of-6.0.3.tgz',
            },
          },
        })
      ).toBe('6.0.3');
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
});
